<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'

/**
 * 顶部工具栏：文本搜图、上传图片搜相似、关键词筛选、排序、网格大小调节、搜索结果标识、批量多选。
 */
const store = useAppStore()
const {
  settings,
  searchMode,
  searchLabel,
  total,
  displayImages,
  sortBy,
  order,
  querySource,
  canCompare,
  selectionMode,
  selectedCount,
  allSelected
} = storeToRefs(store)

const emit = defineEmits<{
  (e: 'compare'): void
}>()

const searchText = ref('')
const keyword = ref('')
const uploading = ref(false)

/** 被搜图缩略图：让用户始终知道当前结果是基于哪张图检索的 */
const querySrc = computed(() =>
  querySource.value ? `pixmind://${encodeURIComponent(querySource.value.path)}` : ''
)

async function onSearch() {
  if (searchText.value.trim()) {
    await store.searchByText(searchText.value)
  } else {
    store.clearSearch()
  }
}

/** 上传一张外部图片，在当前图库中找相似图 */
async function onUploadSearch() {
  uploading.value = true
  try {
    const ok = await store.uploadAndSearch()
    if (ok && store.displayImages.length === 0) {
      ElMessage.info('未找到相似图片（请确认图库已生成 Embedding）')
    }
  } catch {
    ElMessage.error('以图搜图失败，请确认 CLIP 模型已就绪')
  } finally {
    uploading.value = false
  }
}

function onKeywordInput() {
  store.applyFilter({ ...store.filter, keyword: keyword.value || undefined })
}

function clearSearch() {
  searchText.value = ''
  store.clearSearch()
  store.reload()
}

const gridSize = computed({
  get: () => settings.value.gridSize,
  set: (v: number) => store.setGridSize(v)
})

function onSortChange(val: string) {
  const [by, ord] = val.split(':') as [any, any]
  store.setSort(by, ord)
}

const sortValue = computed(() => `${sortBy.value}:${order.value}`)

/* ------------------------------ 多选批量删除 ------------------------------ */

function onToggleAll() {
  if (allSelected.value) store.clearSelection()
  else store.selectAll()
}

async function onDeleteSelected() {
  const n = selectedCount.value
  if (!n) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${n} 张图片？文件将被移入系统回收站。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' }
    )
    const deleted = await store.deleteSelected()
    ElMessage.success(`已将 ${deleted} 张图片移入回收站`)
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <div class="toolbar-wrap">
    <header class="toolbar no-select">
    <div class="search-box">
      <el-input
        v-model="searchText"
        placeholder="输入自然语言描述进行 AI 文本搜图，例如：海边的日落"
        clearable
        @keyup.enter="onSearch"
        @clear="clearSearch"
      >
        <template #prefix><el-icon><MagicStick /></el-icon></template>
        <template #append>
          <el-button type="primary" @click="onSearch">搜索</el-button>
        </template>
      </el-input>
    </div>

    <el-button :loading="uploading" @click="onUploadSearch">
      <el-icon><UploadFilled /></el-icon>
      <span class="btn-text">上传图片搜相似</span>
    </el-button>

    <div v-if="querySource" class="query-chip" :title="querySource.path">
      <img :src="querySrc" alt="被搜图" />
      <div class="q-text">
        <span class="q-title">被搜图</span>
        <span class="q-name">{{ querySource.filename }}</span>
      </div>
      <el-button
        size="small"
        type="primary"
        :disabled="!canCompare"
        @click="emit('compare')"
      >
        <el-icon><Switch /></el-icon>
        <span class="btn-text">对比</span>
      </el-button>
    </div>

    <div class="filters">
      <el-input
        v-model="keyword"
        placeholder="按文件名筛选"
        clearable
        style="width: 180px"
        @input="onKeywordInput"
        @clear="onKeywordInput"
      >
        <template #prefix><el-icon><Filter /></el-icon></template>
      </el-input>

      <el-select :model-value="sortValue" style="width: 150px" @change="onSortChange">
        <el-option label="最新添加" value="createdAt:desc" />
        <el-option label="最早添加" value="createdAt:asc" />
        <el-option label="修改时间↓" value="mtime:desc" />
        <el-option label="文件名 A-Z" value="filename:asc" />
        <el-option label="大小↓" value="size:desc" />
      </el-select>

      <div class="grid-slider">
        <el-icon><Grid /></el-icon>
        <el-slider
          v-model="gridSize"
          :min="120"
          :max="320"
          :step="20"
          style="width: 100px"
        />
      </div>
    </div>

    <div class="status">
      <el-button
        :type="selectionMode ? 'primary' : 'default'"
        @click="store.toggleSelectionMode()"
      >
        <el-icon><Select /></el-icon>
        <span class="btn-text">{{ selectionMode ? '退出多选' : '多选' }}</span>
      </el-button>
      <el-tag v-if="searchMode !== 'none'" type="success" closable @close="clearSearch">
        {{ searchLabel }} · {{ displayImages.length }} 项
      </el-tag>
      <span v-else class="count">共 {{ total }} 张</span>
    </div>
  </header>

  <!-- 多选模式下的批量操作条 -->
  <div v-if="selectionMode" class="batch-bar no-select">
    <el-checkbox
      :model-value="allSelected"
      :indeterminate="selectedCount > 0 && !allSelected"
      @change="onToggleAll"
    >
      全选
    </el-checkbox>
    <span class="sel-count">已选 {{ selectedCount }} 项</span>
    <el-button size="small" text :disabled="!selectedCount" @click="store.clearSelection()">
      清空选择
    </el-button>
    <div class="spacer" />
    <el-button
      type="danger"
      size="small"
      :disabled="!selectedCount"
      @click="onDeleteSelected"
    >
      <el-icon><Delete /></el-icon>
      删除选中（{{ selectedCount }}）
    </el-button>
  </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-bg);
}
.search-box {
  flex: 1 1 240px;
  min-width: 200px;
  max-width: 560px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
}
.grid-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--pm-text-soft);
}
.status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.count {
  font-size: 13px;
  color: var(--pm-text-soft);
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-bg-soft);
}
.batch-bar .sel-count {
  font-size: 13px;
  color: var(--pm-text-soft);
}
.batch-bar .spacer {
  flex: 1;
}
.btn-text {
  margin-left: 4px;
}
.query-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  background: var(--pm-bg-soft);
  flex-shrink: 0;
}
.query-chip img {
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: 6px;
}
.q-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  max-width: 130px;
}
.q-title {
  font-size: 11px;
  color: var(--pm-text-soft);
}
.q-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
