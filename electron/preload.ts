import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  WatchDir,
  ImageRecord,
  Tag,
  PageQuery,
  PageResult,
  SearchResult,
  SearchFilter,
  AppSettings,
  TaskProgress,
  FileMeta
} from '../shared/types'

/**
 * 通过 contextBridge 暴露类型安全的 API 给渲染进程。
 * 渲染进程只能通过 window.api 访问后端能力，保证安全隔离。
 */
const api = {
  // 目录
  dirAdd: (): Promise<WatchDir | null> => ipcRenderer.invoke(IPC.DIR_ADD),
  dirList: (): Promise<WatchDir[]> => ipcRenderer.invoke(IPC.DIR_LIST),
  dirRemove: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.DIR_REMOVE, id),
  dirToggle: (id: number, enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC.DIR_TOGGLE, id, enabled),
  dirRescan: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.DIR_RESCAN, id),

  // 图片
  imgPage: (q: PageQuery): Promise<PageResult<ImageRecord>> => ipcRenderer.invoke(IPC.IMG_PAGE, q),
  imgGet: (id: number): Promise<ImageRecord | undefined> => ipcRenderer.invoke(IPC.IMG_GET, id),
  imgThumb: (path: string): Promise<string | null> => ipcRenderer.invoke(IPC.IMG_THUMB, path),
  imgFavorite: (id: number, favorite: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC.IMG_FAVORITE, id, favorite),
  imgDelete: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.IMG_DELETE, id),
  imgDeleteMany: (ids: number[]): Promise<number> =>
    ipcRenderer.invoke(IPC.IMG_DELETE_MANY, ids),
  imgFileMeta: (filePath: string): Promise<FileMeta | null> =>
    ipcRenderer.invoke(IPC.IMG_FILE_META, filePath),

  // 搜索
  searchByText: (text: string, topK?: number, filter?: SearchFilter): Promise<SearchResult[]> =>
    ipcRenderer.invoke(IPC.SEARCH_BY_TEXT, text, topK, filter),
  searchByImage: (
    payload: { imageId?: number; filePath?: string },
    topK?: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> => ipcRenderer.invoke(IPC.SEARCH_BY_IMAGE, payload, topK, filter),

  // 对话框：选择一张外部图片，返回绝对路径
  pickImageFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.DIALOG_PICK_IMAGE),

  // 标签
  tagList: (): Promise<Tag[]> => ipcRenderer.invoke(IPC.TAG_LIST),
  tagCreate: (name: string, color?: string): Promise<Tag> =>
    ipcRenderer.invoke(IPC.TAG_CREATE, name, color),
  tagDelete: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.TAG_DELETE, id),
  tagAssign: (imageId: number, tagId: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.TAG_ASSIGN, imageId, tagId),
  tagUnassign: (imageId: number, tagId: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.TAG_UNASSIGN, imageId, tagId),

  // 设置
  settingsGet: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  settingsSet: (patch: Partial<AppSettings>): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, patch),

  // 事件订阅
  onTaskProgress: (cb: (p: TaskProgress) => void) => {
    const listener = (_e: unknown, p: TaskProgress) => cb(p)
    ipcRenderer.on(IPC.EVT_TASK_PROGRESS, listener)
    return () => ipcRenderer.off(IPC.EVT_TASK_PROGRESS, listener)
  },
  onImageAdded: (cb: (img: ImageRecord) => void) => {
    const listener = (_e: unknown, img: ImageRecord) => cb(img)
    ipcRenderer.on(IPC.EVT_IMAGE_ADDED, listener)
    return () => ipcRenderer.off(IPC.EVT_IMAGE_ADDED, listener)
  },
  onImageRemoved: (cb: (id: number) => void) => {
    const listener = (_e: unknown, id: number) => cb(id)
    ipcRenderer.on(IPC.EVT_IMAGE_REMOVED, listener)
    return () => ipcRenderer.off(IPC.EVT_IMAGE_REMOVED, listener)
  },
  onImageEmbedded: (cb: (id: number) => void) => {
    const listener = (_e: unknown, id: number) => cb(id)
    ipcRenderer.on(IPC.EVT_IMAGE_EMBEDDED, listener)
    return () => ipcRenderer.off(IPC.EVT_IMAGE_EMBEDDED, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PixMindApi = typeof api
