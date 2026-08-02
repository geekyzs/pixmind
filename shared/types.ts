/**
 * 前后端共享的类型定义
 * 渲染进程与主进程都通过此文件保证类型一致
 */

/** 图片记录 */
export interface ImageRecord {
  id: number
  path: string
  filename: string
  dirId: number
  width: number
  height: number
  size: number
  format: string
  mtime: number
  createdAt: number
  favorite: 0 | 1
  /** 是否已生成 embedding: 0 未生成 / 1 已生成 */
  embedded: 0 | 1
  tags?: string[]
}

/** 监听目录 */
export interface WatchDir {
  id: number
  path: string
  enabled: 0 | 1
  createdAt: number
  imageCount?: number
}

/** 标签 */
export interface Tag {
  id: number
  name: string
  color: string
  count?: number
}

/** 搜索结果（带相似度分数） */
export interface SearchResult {
  image: ImageRecord
  score: number
}

/**
 * 任意本地图片文件的元信息
 * 用于「以图搜图」的查询图：外部上传/拖入的图片并未入库，
 * 没有 ImageRecord，但对比视图仍需展示其尺寸、体积等信息。
 */
export interface FileMeta {
  path: string
  filename: string
  width: number
  height: number
  size: number
  format: string
  mtime: number
}

/** 搜索过滤条件 */
export interface SearchFilter {
  keyword?: string
  tagIds?: number[]
  dirIds?: number[]
  favoriteOnly?: boolean
  format?: string
}

/** 分页请求 */
export interface PageQuery {
  offset: number
  limit: number
  filter?: SearchFilter
  sortBy?: 'createdAt' | 'mtime' | 'filename' | 'size'
  order?: 'asc' | 'desc'
}

/** 分页结果 */
export interface PageResult<T> {
  items: T[]
  total: number
}

/** 后台任务类型 */
export type TaskType = 'scan' | 'embed' | 'watch'

/** 后台任务进度事件 */
export interface TaskProgress {
  type: TaskType
  total: number
  done: number
  running: boolean
  message?: string
}

/** 应用设置 */
export interface AppSettings {
  theme: 'dark' | 'light'
  gridSize: number
  autoEmbed: boolean
  concurrency: number
}

/** IPC 通道名常量 */
export const IPC = {
  // 目录管理
  DIR_ADD: 'dir:add',
  DIR_LIST: 'dir:list',
  DIR_REMOVE: 'dir:remove',
  DIR_TOGGLE: 'dir:toggle',
  DIR_RESCAN: 'dir:rescan',
  // 图片
  IMG_PAGE: 'img:page',
  IMG_GET: 'img:get',
  IMG_THUMB: 'img:thumb',
  IMG_FAVORITE: 'img:favorite',
  IMG_DELETE: 'img:delete',
  IMG_FILE_META: 'img:file-meta',
  // 搜索
  SEARCH_BY_TEXT: 'search:text',
  SEARCH_BY_IMAGE: 'search:image',
  // 对话框
  DIALOG_PICK_IMAGE: 'dialog:pick-image',
  // 标签
  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_DELETE: 'tag:delete',
  TAG_ASSIGN: 'tag:assign',
  TAG_UNASSIGN: 'tag:unassign',
  // 设置
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  // 事件（主 -> 渲染）
  EVT_TASK_PROGRESS: 'evt:task-progress',
  EVT_IMAGE_ADDED: 'evt:image-added',
  EVT_IMAGE_REMOVED: 'evt:image-removed',
  EVT_IMAGE_EMBEDDED: 'evt:image-embedded'
} as const
