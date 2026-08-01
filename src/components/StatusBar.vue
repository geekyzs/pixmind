<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'

/**
 * 底部状态栏：显示扫描 / Embedding 生成的后台任务进度。
 */
const store = useAppStore()
const { progress, progressPercent } = storeToRefs(store)

const taskName = computed(() => {
  switch (progress.value.type) {
    case 'scan':
      return '扫描图片'
    case 'embed':
      return '生成 Embedding'
    default:
      return '后台任务'
  }
})
</script>

<template>
  <footer class="statusbar no-select">
    <transition name="fade">
      <div v-if="progress.running" class="task">
        <el-icon class="spin"><Loading /></el-icon>
        <span class="name">{{ taskName }}</span>
        <el-progress
          :percentage="progressPercent"
          :stroke-width="6"
          :show-text="false"
          style="width: 200px"
        />
        <span class="detail">{{ progress.done }} / {{ progress.total }}</span>
        <span v-if="progress.message" class="msg">{{ progress.message }}</span>
      </div>
      <div v-else class="task idle">
        <el-icon><CircleCheck /></el-icon>
        <span>就绪</span>
      </div>
    </transition>
  </footer>
</template>

<style scoped>
.statusbar {
  height: 32px;
  border-top: 1px solid var(--pm-border);
  background: var(--pm-bg-soft);
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 12px;
  color: var(--pm-text-soft);
}
.task {
  display: flex;
  align-items: center;
  gap: 10px;
}
.task .name {
  font-weight: 600;
  color: var(--pm-text);
}
.msg {
  max-width: 340px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spin {
  animation: spin 1s linear infinite;
  color: var(--pm-primary);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
