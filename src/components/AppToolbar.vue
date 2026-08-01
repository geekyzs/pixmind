<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'

/**
 * 顶部工具栏：文本搜图、上传图片搜相似、关键词筛选、排序、网格大小调节、搜索结果标识。
 */
const store = useAppStore()
const { settings, searchMode, searchLabel, total, displayImages, sortBy, order } =
  storeToRefs(store)

const searchText = ref('')
const keyword = ref('')
const uploading = ref(false)

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
</script>

<template>
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
      <el-tag v-if="searchMode !== 'none'" type="success" closable @close="clearSearch">
        {{ searchLabel }} · {{ displayImages.length }} 项
      </el-tag>
      <span v-else class="count">共 {{ total }} 张</span>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-bg);
}
.search-box {
  flex: 1;
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
}
.count {
  font-size: 13px;
  color: var(--pm-text-soft);
}
.btn-text {
  margin-left: 4px;
}
</style>
