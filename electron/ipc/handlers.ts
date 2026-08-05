import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { IPC } from '../../shared/types'
import type { PageQuery, SearchFilter, AppSettings, FileMeta } from '../../shared/types'
import { dirRepo, imageRepo, tagRepo, settingsRepo, embeddingRepo } from '../db/repository'
import { scanDir, scanAll } from '../scanner/scanner'
import { watchManager } from '../scanner/watcher'
import { embeddingManager } from '../embedding/embeddingManager'
import { searchService } from '../search/searchService'
import { getSearchEngine } from '../search/engineFactory'
import { getThumbnail } from '../scanner/thumbnail'
import { getFormat } from '../scanner/fileUtils'
import { bus, BusEvent } from '../core/bus'
import type { TaskProgress } from '../../shared/types'

/** 注册所有 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  /* ------------------------------ 目录管理 ------------------------------ */

  ipcMain.handle(IPC.DIR_ADD, async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths.length) return null
    const dir = dirRepo.add(result.filePaths[0])
    // 后台扫描 + 监听
    watchManager.watch(dir.id, dir.path)
    scanDir(dir.id).then(() => embeddingManager.enqueuePending())
    return dir
  })

  ipcMain.handle(IPC.DIR_LIST, () => dirRepo.list())

  ipcMain.handle(IPC.DIR_REMOVE, async (_e, id: number) => {
    await watchManager.unwatch(id)
    dirRepo.remove(id)
    // 刷新内存索引（图片已被级联删除）
    await getSearchEngine().init()
    return true
  })

  ipcMain.handle(IPC.DIR_TOGGLE, async (_e, id: number, enabled: boolean) => {
    dirRepo.toggle(id, enabled)
    if (enabled) {
      const d = dirRepo.get(id)
      if (d) {
        watchManager.watch(id, d.path)
        scanDir(id).then(() => embeddingManager.enqueuePending())
      }
    } else {
      await watchManager.unwatch(id)
    }
    return true
  })

  ipcMain.handle(IPC.DIR_RESCAN, async (_e, id: number) => {
    await scanDir(id)
    embeddingManager.enqueuePending()
    return true
  })

  /**
   * 清空所有数据并重新扫描：
   * 1. 停止所有文件监听，避免清库过程中并发写入
   * 2. 清空 images / embeddings / image_tags（保留目录与标签定义）
   * 3. 重置内存向量索引
   * 4. 通知渲染进程清空列表
   * 5. 重新对所有启用目录做全量扫描并重新生成 embedding
   */
  ipcMain.handle(IPC.DATA_RESET, async () => {
    await watchManager.stopAll()

    imageRepo.clearAll()
    await getSearchEngine().init()

    // 通知前端立即清空当前列表
    bus.emit(BusEvent.DATA_RESET)

    // 重新监听 + 全量扫描 + 重新编码（后台执行，不阻塞返回）
    watchManager.start()
    scanAll().then(() => embeddingManager.enqueuePending())
    return true
  })

  /* ------------------------------- 图片 -------------------------------- */

  /** 删除单张：移入系统回收站，并清理索引、向量、通知渲染进程 */
  async function deleteOne(id: number): Promise<boolean> {
    const img = imageRepo.get(id)
    if (!img) return false
    try {
      if (fs.existsSync(img.path)) await shell.trashItem(img.path)
    } catch {
      /* 忽略回收站失败，仍继续清理索引 */
    }
    imageRepo.removeByPath(img.path)
    await getSearchEngine().remove(id)
    bus.emit(BusEvent.IMAGE_REMOVED, id)
    return true
  }

  ipcMain.handle(IPC.IMG_PAGE, (_e, q: PageQuery) => imageRepo.page(q))

  ipcMain.handle(IPC.IMG_GET, (_e, id: number) => imageRepo.get(id))

  ipcMain.handle(IPC.IMG_THUMB, async (_e, imagePath: string) => {
    const thumb = await getThumbnail(imagePath)
    // 走自定义 pixmind:// 安全协议，避免渲染进程被禁止加载 file:// 本地资源
    return thumb ? `pixmind://${encodeURIComponent(thumb)}` : null
  })

  ipcMain.handle(IPC.IMG_FAVORITE, (_e, id: number, favorite: boolean) => {
    imageRepo.setFavorite(id, favorite)
    return true
  })

  ipcMain.handle(IPC.IMG_DELETE, async (_e, id: number) => {
    return deleteOne(id)
  })

  // 批量删除：逐张移入回收站并清理索引/向量，返回成功删除的数量
  ipcMain.handle(IPC.IMG_DELETE_MANY, async (_e, ids: number[]) => {
    let deleted = 0
    for (const id of ids) {
      if (await deleteOne(id)) deleted++
    }
    return deleted
  })

  // 读取任意本地图片的元信息：外部查询图未入库，对比视图需要它来展示尺寸/体积差异
  ipcMain.handle(IPC.IMG_FILE_META, async (_e, filePath: string): Promise<FileMeta | null> => {
    try {
      const stat = await fs.promises.stat(filePath)
      let width = 0
      let height = 0
      try {
        const meta = await sharp(filePath).metadata()
        width = meta.width || 0
        height = meta.height || 0
      } catch {
        // 元数据读取失败不影响其余字段
      }
      return {
        path: filePath,
        filename: path.basename(filePath),
        width,
        height,
        size: stat.size,
        format: getFormat(filePath),
        mtime: Math.floor(stat.mtimeMs)
      }
    } catch {
      return null
    }
  })

  /* ------------------------------- 搜索 -------------------------------- */

  ipcMain.handle(IPC.SEARCH_BY_TEXT, (_e, text: string, topK: number, filter?: SearchFilter) =>
    searchService.byText(text, topK ?? 100, filter)
  )

  ipcMain.handle(
    IPC.SEARCH_BY_IMAGE,
    async (_e, payload: { imageId?: number; filePath?: string }, topK: number, filter?: SearchFilter) => {
      if (payload.imageId != null) return searchService.byImageId(payload.imageId, topK ?? 100, filter)
      if (payload.filePath) return searchService.byImagePath(payload.filePath, topK ?? 100, filter)
      return []
    }
  )

  /* ------------------------------ 对话框 ------------------------------ */

  // 选择一张外部图片文件，返回其绝对路径（供“上传图片搜相似”使用）
  ipcMain.handle(IPC.DIALOG_PICK_IMAGE, async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'avif'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  /* ------------------------------- 标签 -------------------------------- */

  ipcMain.handle(IPC.TAG_LIST, () => tagRepo.list())
  ipcMain.handle(IPC.TAG_CREATE, (_e, name: string, color?: string) => tagRepo.create(name, color))
  ipcMain.handle(IPC.TAG_DELETE, (_e, id: number) => {
    tagRepo.delete(id)
    return true
  })
  ipcMain.handle(IPC.TAG_ASSIGN, (_e, imageId: number, tagId: number) => {
    tagRepo.assign(imageId, tagId)
    return true
  })
  ipcMain.handle(IPC.TAG_UNASSIGN, (_e, imageId: number, tagId: number) => {
    tagRepo.unassign(imageId, tagId)
    return true
  })

  /* ------------------------------- 设置 -------------------------------- */

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    const settings: AppSettings = {
      theme: settingsRepo.get('theme', 'dark'),
      gridSize: settingsRepo.get('gridSize', 180),
      autoEmbed: settingsRepo.get('autoEmbed', true),
      concurrency: settingsRepo.get('concurrency', 1)
    }
    return settings
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    for (const [k, v] of Object.entries(patch)) settingsRepo.set(k, v)
    return true
  })

  /* --------------------- 内部事件 -> 转发给渲染进程 --------------------- */

  const send = (channel: string, ...args: any[]) => {
    getWindow()?.webContents.send(channel, ...args)
  }

  bus.on(BusEvent.TASK_PROGRESS, (p: TaskProgress) => send(IPC.EVT_TASK_PROGRESS, p))
  bus.on(BusEvent.IMAGE_ADDED, (img) => send(IPC.EVT_IMAGE_ADDED, img))
  bus.on(BusEvent.IMAGE_REMOVED, (id) => send(IPC.EVT_IMAGE_REMOVED, id))
  bus.on(BusEvent.IMAGE_EMBEDDED, (id) => send(IPC.EVT_IMAGE_EMBEDDED, id))
  bus.on(BusEvent.DATA_RESET, () => send(IPC.EVT_DATA_RESET))
}
