<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { ImageRecord } from '@shared/types'
import { ElMessage } from 'element-plus'

/**
 * 图片预览抽屉
 * 展示大图、元信息、标签管理，并提供“以图搜图”“收藏”“删除”入口。
 */
const props = defineProps<{
  modelValue: boolean
  image: ImageRecord | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'search-similar', img: ImageRecord): void
}>()

const store = useAppStore()
const { tags } = storeToRefs(store)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

// 用 pixmind 协议加载本地原图
const fullSrc = computed(() =>
  props.image ? `pixmind://${encodeURIComponent(props.image.path)}` : ''
)

const newTag = ref('')

const imageTagIds = computed(() => {
  if (!props.image?.tags) return new Set<string>()
  return new Set(props.image.tags)
})

async function toggleTag(tagName: string, tagId: number) {
  if (!props.image) return
  if (imageTagIds.value.has(tagName)) {
    await window.api.tagUnassign(props.image.id, tagId)
    props.image.tags = (props.image.tags || []).filter((t) => t !== tagName)
  } else {
    await window.api.tagAssign(props.image.id, tagId)
    props.image.tags = [...(props.image.tags || []), tagName]
  }
  await store.loadTags()
}

async function addAndAssignTag() {
  const name = newTag.value.trim()
  if (!name || !props.image) return
  const tag = await window.api.tagCreate(name)
  await window.api.tagAssign(props.image.id, tag.id)
  props.image.tags = [...(props.image.tags || []), tag.name]
  newTag.value = ''
  await store.loadTags()
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

async function onFavorite() {
  if (props.image) await store.toggleFavorite(props.image)
}

function onSearchSimilar() {
  if (props.image) {
    emit('search-similar', props.image)
    visible.value = false
  }
}

async function onDelete() {
  if (!props.image) return
  await store.deleteImage(props.image.id)
  ElMessage.success('已移入回收站')
  visible.value = false
}

watch(visible, (v) => {
  if (v) store.loadTags()
})
</script>

<template>
  <el-drawer v-model="visible" size="60%" :with-header="false" direction="rtl">
    <div v-if="image" class="preview">
      <div class="preview-image">
        <img :src="fullSrc" :alt="image.filename" />
      </div>
      <div class="preview-info">
        <h3 :title="image.filename">{{ image.filename }}</h3>
        <div class="meta">
          <div><span>尺寸</span>{{ image.width }} × {{ image.height }}</div>
          <div><span>大小</span>{{ fmtSize(image.size) }}</div>
          <div><span>格式</span>{{ image.format.toUpperCase() }}</div>
          <div><span>修改</span>{{ fmtDate(image.mtime) }}</div>
          <div class="path"><span>路径</span>{{ image.path }}</div>
        </div>

        <div class="actions">
          <el-button :type="image.favorite ? 'warning' : 'default'" @click="onFavorite">
            <el-icon><StarFilled /></el-icon>
            {{ image.favorite ? '已收藏' : '收藏' }}
          </el-button>
          <el-button type="primary" @click="onSearchSimilar">
            <el-icon><Search /></el-icon> 以图搜图
          </el-button>
          <el-button type="danger" plain @click="onDelete">
            <el-icon><Delete /></el-icon> 删除
          </el-button>
        </div>

        <div class="tags-section">
          <h4>标签</h4>
          <div class="tag-list">
            <el-check-tag
              v-for="t in tags"
              :key="t.id"
              :checked="imageTagIds.has(t.name)"
              @change="toggleTag(t.name, t.id)"
            >
              {{ t.name }}
            </el-check-tag>
          </div>
          <div class="add-tag">
            <el-input
              v-model="newTag"
              placeholder="新建标签并添加"
              size="small"
              @keyup.enter="addAndAssignTag"
            >
              <template #append>
                <el-button @click="addAndAssignTag">添加</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}
.preview-image {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pm-bg-soft);
  border-radius: 8px;
  overflow: hidden;
}
.preview-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.preview-info h3 {
  margin: 0 0 12px;
  word-break: break-all;
}
.meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  font-size: 13px;
  color: var(--pm-text);
  margin-bottom: 16px;
}
.meta span {
  display: inline-block;
  width: 42px;
  color: var(--pm-text-soft);
}
.meta .path {
  grid-column: 1 / -1;
  word-break: break-all;
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.tags-section h4 {
  margin: 0 0 10px;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
