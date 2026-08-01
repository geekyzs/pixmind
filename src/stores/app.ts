import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type {
  ImageRecord,
  WatchDir,
  Tag,
  SearchFilter,
  TaskProgress,
  AppSettings
} from '@shared/types'

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

  const progress = ref<TaskProgress>({ type: 'scan', total: 0, done: 0, running: false })
  const loading = ref(false)

  const PAGE = 100
  let offset = 0
  let noMore = false

  /* --------------------------- getters --------------------------- */
  const displayImages = computed(() => (searchResults.value ? searchResults.value : images.value))
  const isSearching = computed(() => searchMode.value !== 'none')
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
      applySearchResults(results, 'text', `文本："${text}"`)
    } finally {
      loading.value = false
    }
  }

  async function searchByImageId(imageId: number) {
    loading.value = true
    try {
      const results = await window.api.searchByImage({ imageId }, 200, plain(filter.value))
      applySearchResults(results, 'image', '以图搜图')
    } finally {
      loading.value = false
    }
  }

  async function searchByImagePath(filePath: string) {
    loading.value = true
    try {
      const results = await window.api.searchByImage({ filePath }, 200, plain(filter.value))
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
  }

  function clearSearch() {
    searchResults.value = null
    searchScores.value = new Map()
    searchMode.value = 'none'
    searchLabel.value = ''
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
    progress,
    loading,
    // getters
    displayImages,
    isSearching,
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
    toggleFavorite,
    deleteImage,
    bindEvents
  }
})
