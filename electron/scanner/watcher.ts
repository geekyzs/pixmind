import chokidar, { FSWatcher } from 'chokidar'
import { imageRepo, dirRepo, embeddingRepo } from '../db/repository'
import { getDb } from '../db/database'
import { isImageFile } from './fileUtils'
import { indexImage } from './scanner'
import { bus, BusEvent } from '../core/bus'

/**
 * 文件监听管理器
 * 为每个启用的目录建立 Chokidar watcher，实现新增/删除/修改的实时同步。
 * 新增图片会写入数据库并触发 IMAGE_ADDED，供 embedding 队列消费。
 */
class WatchManager {
  private watchers = new Map<number, FSWatcher>()

  /** 启动所有启用目录的监听 */
  start(): void {
    const dirs = dirRepo.list().filter((d) => d.enabled)
    for (const d of dirs) this.watch(d.id, d.path)
  }

  watch(dirId: number, dirPath: string): void {
    if (this.watchers.has(dirId)) return

    const watcher = chokidar.watch(dirPath, {
      ignored: /(^|[/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true, // 初始文件由 scanner 处理，避免重复
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })

    watcher
      .on('add', async (filePath) => {
        if (!isImageFile(filePath)) return
        const id = await indexImage(filePath, dirId)
        if (id !== null) {
          const img = imageRepo.get(id)
          if (img) bus.emit(BusEvent.IMAGE_ADDED, img)
        }
      })
      .on('change', async (filePath) => {
        if (!isImageFile(filePath)) return
        const existing = imageRepo.getByPath(filePath)
        // 内容变化：重新索引，并清空旧 embedding 以便重新生成
        const id = await indexImage(filePath, dirId)
        if (id !== null && existing) {
          embeddingRepo.remove(id)
          getDb().prepare('UPDATE images SET embedded = 0 WHERE id = ?').run(id)
          const img = imageRepo.get(id)
          if (img) bus.emit(BusEvent.IMAGE_ADDED, img)
        }
      })
      .on('unlink', (filePath) => {
        if (!isImageFile(filePath)) return
        const removedId = imageRepo.removeByPath(filePath)
        if (removedId !== undefined) bus.emit(BusEvent.IMAGE_REMOVED, removedId)
      })

    this.watchers.set(dirId, watcher)
  }

  async unwatch(dirId: number): Promise<void> {
    const w = this.watchers.get(dirId)
    if (w) {
      await w.close()
      this.watchers.delete(dirId)
    }
  }

  async stopAll(): Promise<void> {
    for (const w of this.watchers.values()) await w.close()
    this.watchers.clear()
  }
}

export const watchManager = new WatchManager()
