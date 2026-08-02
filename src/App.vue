<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import AppSidebar from '@/components/AppSidebar.vue'
import AppToolbar from '@/components/AppToolbar.vue'
import VirtualGrid from '@/components/VirtualGrid.vue'
import PreviewDrawer from '@/components/PreviewDrawer.vue'
import CompareDialog from '@/components/CompareDialog.vue'
import StatusBar from '@/components/StatusBar.vue'
import type { ImageRecord } from '@shared/types'
import { ElMessage } from 'element-plus'

const store = useAppStore()
const { displayImages, settings, searchScores, isSearching, canCompare, selectionMode, selectedIds } =
  storeToRefs(store)

const previewVisible = ref(false)
const currentImage = ref<ImageRecord | null>(null)

const compareVisible = ref(false)
const compareTarget = ref<ImageRecord | null>(null)

const gap = 14

function openPreview(img: ImageRecord) {
  currentImage.value = img
  previewVisible.value = true
}

/** 打开「被搜图 vs 该结果」对比视图 */
function openCompare(img: ImageRecord | null) {
  if (!canCompare.value) {
    ElMessage.info('请先进行一次以图搜图')
    return
  }
  compareTarget.value = img
  compareVisible.value = true
}

function onReachEnd() {
  store.loadMore()
}

async function onSearchSimilar(img: ImageRecord) {
  await store.searchByImageId(img.id)
}

function onContext(img: ImageRecord, event: MouseEvent) {
  // 右键快捷收藏
  store.toggleFavorite(img)
  event.preventDefault()
}

// 拖拽外部图片进来 -> 以图搜图
const dropActive = ref(false)
function onDrop(e: DragEvent) {
  dropActive.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    const path = (file as any).path as string | undefined
    if (path) {
      store.searchByImagePath(path)
      ElMessage.info('正在以拖入的图片进行搜索')
    }
  }
}

onMounted(async () => {
  store.bindEvents()
  await store.loadSettings()
  await Promise.all([store.loadDirs(), store.loadTags()])
  await store.reload()
})
</script>

<template>
  <div
    class="app-layout"
    :class="{ 'drop-active': dropActive }"
    @dragover.prevent="dropActive = true"
    @dragleave.prevent="dropActive = false"
    @drop.prevent="onDrop"
  >
    <AppSidebar />
    <main class="main">
      <AppToolbar @compare="openCompare(null)" />
      <div class="grid-area">
        <VirtualGrid
          :items="displayImages"
          :item-size="settings.gridSize"
          :gap="gap"
          :scores="isSearching ? searchScores : undefined"
          :comparable="canCompare"
          :selection-mode="selectionMode"
          :selected-ids="selectedIds"
          @open="openPreview"
          @reach-end="onReachEnd"
          @context="onContext"
          @compare="openCompare"
          @toggle-select="store.toggleSelect($event.id)"
        />
      </div>
      <StatusBar />
    </main>

    <PreviewDrawer
      v-model="previewVisible"
      :image="currentImage"
      :comparable="canCompare"
      @search-similar="onSearchSimilar"
      @compare="openCompare"
    />

    <CompareDialog v-model="compareVisible" :target="compareTarget" />

    <div v-if="dropActive" class="drop-hint">
      <el-icon><UploadFilled /></el-icon>
      <span>松开以“以图搜图”</span>
    </div>
  </div>
</template>

<style scoped>
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.grid-area {
  flex: 1;
  min-height: 0;
}
.app-layout.drop-active {
  outline: 3px dashed var(--pm-primary);
  outline-offset: -6px;
}
.drop-hint {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  font-size: 20px;
  pointer-events: none;
  z-index: 3000;
}
.drop-hint .el-icon {
  font-size: 64px;
}
</style>
