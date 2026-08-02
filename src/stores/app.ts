import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type {
  ImageRecord,
  WatchDir,
  Tag,
  SearchFilter,
  TaskProgress,
  AppSettings,
  FileMeta
} from '@shared/types'

/**
 * 查询源（即「被搜图」）
 * 以图搜图时记录本次检索所用的图片，供结果对比视图作为基准图使用。
 * 库内图片带 imageId，外部上传/拖入的图片只有路径与文件元信息。
 */
export interface QuerySource {
  kind: 'library' | 'external'
  path: string
  filename: string
  imageId?: number
  meta?: FileMeta | null
}

/**
 * 将 Vue reactive 对象转为可结构化克隆的纯对象。
 * 通过 IPC 传给主进程前必须处理，否则 Proxy 无法被 structured clone，
 * 会抛出 "An object could not be cloned"。
 */
function plain<T>(value: T): T {
  if (value == null) return value
  return JSON.parse(JSON.stringify(toRaw(value)))
}

/**
 * 全局应用状态
 * UI 组件只与 store 交互，store 封装对 window.api 的调用，实现 UI 与业务解耦。
 */
export const useAppStore = defineStore('app', () => {
  /* ---------------------------- state ---------------------------- */
  const images = ref<ImageRecord[]>([])
  const total = ref(0)
  const dirs = ref<WatchDir[]>([])
  const tags = ref<Tag[]>([])
  const settings = ref<AppSettings>({
    theme: 'dark',
    gridSize: 180,
    autoEmbed: true,
    concurrency: 1
  })

  const filter = ref<SearchFilter>({})
  const sortBy = ref<'createdAt' | 'mtime' | 'filename' | 'size'>('createdAt')
  const order = ref<'asc' | 'desc'>('desc')

  // 搜索模式：null 为普通浏览，否则为搜索结果集
  const searchResults = ref<ImageRecord[] | null>(null)
  const searchScores = ref<Map<number, number>>(new Map())
  const searchMode = ref<'none' | 'text' | 'image'>('none')
  const searchLabel = ref('')
  // 本次以图搜图的「被搜图」，文本搜图时为 null
  const querySource = ref<QuerySource | null>(null)

  // 多选：selectionMode 打开后网格进入勾选模式，selectedIds 保存已选图片 id
  const selectionMode = ref(false)
  const selectedIds = ref<Set<number>>(new Set())

  const progress = ref<TaskProgress>({ type: 'scan', total: 0, done: 0, running: false })
  const loading = ref(false)

  const PAGE = 100
  let offset = 0
  let noMore = false

  /* --------------------------- getters --------------------------- */
  const displayImages = computed(() => (searchResults.value ? searchResults.value : images.value))
  const isSearching = computed(() => searchMode.value !== 'none')
  /** 只有以图搜图且存在结果时才能进入「被搜图 vs 结果」对比 */
  const canCompare = computed(
    () => !!querySource.value && !!searchResults.value && searchResults.value.length > 0
  )
  const selectedCount = computed(() => selectedIds.value.size)
  /** 是否已全选当前展示的图片 */
  const allSelected = computed(
    () => displayImages.value.length > 0 && selectedIds.value.size === displayImages.value.length
  )
  const progressPercent = computed(() =>
    progress.value.total > 0 ? Math.round((progress.value.done / progress.value.total) * 100) : 0
  )

  /* --------------------------- actions --------------------------- */

  async function loadSettings() {
    settings.value = await window.api.settingsGet()
    applyTheme(settings.value.theme)
  }

  function applyTheme(theme: 'dark' | 'light') {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  async function setTheme(theme: 'dark' | 'light') {
    settings.value.theme = theme
    applyTheme(theme)
    await window.api.settingsSet({ theme })
  }

  async function setGridSize(size: number) {
    settings.value.gridSize = size
    await window.api.settingsSet({ gridSize: size })
  }

  async function loadDirs() {
    dirs.value = await window.api.dirList()
  }

  async function addDir() {
    const dir = await window.api.dirAdd()
    if (dir) await loadDirs()
  }

  async function removeDir(id: number) {
    await window.api.dirRemove(id)
    await loadDirs()
    await reload()
  }

  async function toggleDir(id: number, enabled: boolean) {
    await window.api.dirToggle(id, enabled)
    await loadDirs()
  }

  async function rescanDir(id: number) {
    await window.api.dirRescan(id)
  }

  async function loadTags() {
    tags.value = await window.api.tagList()
  }

  /** 重新从头加载图片列表（应用当前 filter/sort） */
  async function reload() {
    clearSearch()
    offset = 0
    noMore = false
    images.value = []
    await loadMore()
  }

  /** 加载下一页（虚拟滚动/无限加载） */
  async function loadMore() {
    if (noMore || loading.value || searchMode.value !== 'none') return
    loading.value = true
    try {
      const res = await window.api.imgPage({
        offset,
        limit: PAGE,
        filter: plain(filter.value),
        sortBy: sortBy.value,
        order: order.value
      })
      total.value = res.total
      if (res.items.length < PAGE) noMore = true
      images.value.push(...res.items)
      offset += res.items.length
    } finally {
      loading.value = false
    }
  }

  async function applyFilter(f: SearchFilter) {
    filter.value = { ...f }
    await reload()
  }

  async function setSort(by: typeof sortBy.value, ord: typeof order.value) {
    sortBy.value = by
    order.value = ord
    await reload()
  }

  /* ----------------------------- 搜索 ----------------------------- */

  async function searchByText(text: string) {
    if (!text.trim()) {
      clearSearch()
      return
    }
    loading.value = true
    try {
      const results = await window.api.searchByText(text, 200, plain(filter.value))
      querySource.value = null
      applySearchResults(results, 'text', `文本："${text}"`)
    } finally {
      loading.value = false
    }
  }

  async function searchByImageId(imageId: number) {
    loading.value = true
    try {
      const results = await window.api.searchByImage({ imageId }, 200, plain(filter.value))
      const img =
        images.value.find((i) => i.id === imageId) ??
        searchResults.value?.find((i) => i.id === imageId) ??
        (await window.api.imgGet(imageId))
      querySource.value = img
        ? {
            kind: 'library',
            imageId,
            path: img.path,
            filename: img.filename,
            meta: {
              path: img.path,
              filename: img.filename,
              width: img.width,
              height: img.height,
              size: img.size,
              format: img.format,
              mtime: img.mtime
            }
          }
        : null
      applySearchResults(results, 'image', '以图搜图')
    } finally {
      loading.value = false
    }
  }

  async function searchByImagePath(filePath: string) {
    loading.value = true
    try {
      const results = await window.api.searchByImage({ filePath }, 200, plain(filter.value))
      // 外部图片未入库，需单独读取文件元信息用于对比展示
      const meta = await window.api.imgFileMeta(filePath)
      querySource.value = {
        kind: 'external',
        path: filePath,
        filename: meta?.filename ?? filePath.split(/[/\\]/).pop() ?? filePath,
        meta
      }
      applySearchResults(results, 'image', '以图搜图（外部）')
    } finally {
      loading.value = false
    }
  }

  /** 弹出文件选择框上传一张图片，在图库中检索相似图 */
  async function uploadAndSearch(): Promise<boolean> {
    const filePath = await window.api.pickImageFile()
    if (!filePath) return false
    await searchByImagePath(filePath)
    return true
  }

  function applySearchResults(
    results: { image: ImageRecord; score: number }[],
    mode: 'text' | 'image',
    label: string
  ) {
    searchResults.value = results.map((r) => r.image)
    searchScores.value = new Map(results.map((r) => [r.image.id, r.score]))
    searchMode.value = mode
    searchLabel.value = label
    // 结果集变化，旧的选中项不再适用
    clearSelection()
  }

  function clearSearch() {
    searchResults.value = null
    searchScores.value = new Map()
    searchMode.value = 'none'
    searchLabel.value = ''
    querySource.value = null
    clearSelection()
  }

  /** 取某张结果图的相似度（0~1），不在结果集中则为 null */
  function scoreOf(imageId: number): number | null {
    const s = searchScores.value.get(imageId)
    return s == null ? null : s
  }

  /* --------------------------- 图片操作 --------------------------- */

  async function toggleFavorite(img: ImageRecord) {
    const fav = img.favorite ? 0 : 1
    await window.api.imgFavorite(img.id, fav === 1)
    img.favorite = fav
  }

  async function deleteImage(id: number) {
    await window.api.imgDelete(id)
    images.value = images.value.filter((i) => i.id !== id)
    if (searchResults.value) searchResults.value = searchResults.value.filter((i) => i.id !== id)
    total.value = Math.max(0, total.value - 1)
  }

  /* ---------------------------- 多选与批量删除 ---------------------------- */

  function toggleSelectionMode(on?: boolean) {
    selectionMode.value = on ?? !selectionMode.value
    if (!selectionMode.value) clearSelection()
  }

  function toggleSelect(id: number) {
    const s = new Set(selectedIds.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    selectedIds.value = s
  }

  function selectAll() {
    selectedIds.value = new Set(displayImages.value.map((i) => i.id))
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  /** 批量删除选中图片（移入回收站），完成后退出多选模式 */
  async function deleteSelected(): Promise<number> {
    const ids = [...selectedIds.value]
    if (!ids.length) return 0
    const idSet = new Set(ids)
    const deleted = await window.api.imgDeleteMany(ids)
    // 主进程会逐条 emit image-removed 同步列表，这里兜底并修正 total
    images.value = images.value.filter((i) => !idSet.has(i.id))
    if (searchResults.value)
      searchResults.value = searchResults.value.filter((i) => !idSet.has(i.id))
    total.value = Math.max(0, total.value - deleted)
    clearSelection()
    selectionMode.value = false
    return deleted
  }

  /* ------------------------ 事件监听（实时更新） ------------------------ */

  function bindEvents() {
    window.api.onTaskProgress((p) => {
      progress.value = p
    })
    window.api.onImageAdded((img) => {
      // 仅在非搜索、无过滤时插入列表头部，避免打乱搜索结果
      if (searchMode.value === 'none' && !hasActiveFilter()) {
        if (!images.value.some((i) => i.id === img.id)) {
          images.value.unshift(img)
          total.value++
        }
      }
    })
    window.api.onImageRemoved((id) => {
      images.value = images.value.filter((i) => i.id !== id)
      if (searchResults.value) searchResults.value = searchResults.value.filter((i) => i.id !== id)
    })
    window.api.onImageEmbedded((id) => {
      const img = images.value.find((i) => i.id === id)
      if (img) img.embedded = 1
    })
  }

  function hasActiveFilter(): boolean {
    const f = filter.value
    return !!(
      f.keyword ||
      f.favoriteOnly ||
      f.format ||
      (f.tagIds && f.tagIds.length) ||
      (f.dirIds && f.dirIds.length)
    )
  }

  return {
    // state
    images,
    total,
    dirs,
    tags,
    settings,
    filter,
    sortBy,
    order,
    searchResults,
    searchScores,
    searchMode,
    searchLabel,
    querySource,
    selectionMode,
    selectedIds,
    progress,
    loading,
    // getters
    displayImages,
    isSearching,
    canCompare,
    selectedCount,
    allSelected,
    progressPercent,
    // actions
    loadSettings,
    setTheme,
    setGridSize,
    loadDirs,
    addDir,
    removeDir,
    toggleDir,
    rescanDir,
    loadTags,
    reload,
    loadMore,
    applyFilter,
    setSort,
    searchByText,
    searchByImageId,
    searchByImagePath,
    uploadAndSearch,
    clearSearch,
    scoreOf,
    toggleFavorite,
    deleteImage,
    toggleSelectionMode,
    toggleSelect,
    selectAll,
    clearSelection,
    deleteSelected,
    bindEvents
  }
})
