<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

/**
 * 懒加载缩略图组件
 * 使用 IntersectionObserver，仅当进入视口时才请求缩略图，
 * 配合虚拟滚动进一步降低 IO 与内存压力。
 */
const props = defineProps<{
  path: string
}>()

const el = ref<HTMLElement | null>(null)
const src = ref<string>('')
const loaded = ref(false)
const error = ref(false)
let observer: IntersectionObserver | null = null
let requested = false

async function loadThumb() {
  if (requested) return
  requested = true
  try {
    const url = await window.api.imgThumb(props.path)
    if (url) {
      src.value = url
    } else {
      error.value = true
    }
  } catch {
    error.value = true
  }
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          loadThumb()
          observer?.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '200px' }
  )
  if (el.value) observer.observe(el.value)
})

// path 变化时重置（虚拟滚动复用 DOM 节点）
watch(
  () => props.path,
  () => {
    src.value = ''
    loaded.value = false
    error.value = false
    requested = false
    if (el.value && observer) {
      observer.unobserve(el.value)
      observer.observe(el.value)
    }
  }
)

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="el" class="lazy-thumb">
    <img
      v-if="src"
      :src="src"
      loading="lazy"
      @load="loaded = true"
      :class="{ show: loaded }"
    />
    <div v-if="!loaded && !error" class="placeholder">
      <el-icon class="spin"><Loading /></el-icon>
    </div>
    <div v-if="error" class="placeholder err">
      <el-icon><PictureFilled /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.lazy-thumb {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--pm-bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s;
}
img.show {
  opacity: 1;
}
.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pm-text-soft);
  font-size: 22px;
}
.placeholder.err {
  color: var(--pm-border);
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
