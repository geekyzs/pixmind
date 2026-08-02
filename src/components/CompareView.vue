<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'

/**
 * 双图对比画布
 * 提供三种对比模式，并让两张图共享同一套缩放/平移变换，
 * 保证像素级观察时两侧始终处于相同的视角，否则人眼无法判断差异。
 *
 *  side    并排：左右各一张，适合看整体构图差异
 *  slider  滑动：同一位置叠放，用竖向分割线擦除，适合看局部细节差异
 *  diff    差异：上层用 difference 混合模式，相同区域趋近纯黑，快速定位改动
 */
const props = defineProps<{
  leftSrc: string
  rightSrc: string
  leftLabel: string
  rightLabel: string
  mode: 'side' | 'slider' | 'diff'
  /** 图片适应方式：contain 完整显示，cover 铺满（便于对比同构图局部） */
  fit?: 'contain' | 'cover'
}>()

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
/** 分割线位置百分比 */
const split = ref(50)

const MIN_SCALE = 0.2
const MAX_SCALE = 8

const transform = computed(
  () => `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`
)
const objectFit = computed(() => props.fit ?? 'contain')
const zoomText = computed(() => `${Math.round(scale.value * 100)}%`)

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function zoomBy(factor: number) {
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor))
}

/** 以光标位置为锚点缩放，避免放大后目标区域跑出视口 */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = e.clientX - rect.left - rect.width / 2
  const cy = e.clientY - rect.top - rect.height / 2
  const next = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, scale.value * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
  )
  const ratio = next / scale.value
  tx.value = cx - (cx - tx.value) * ratio
  ty.value = cy - (cy - ty.value) * ratio
  scale.value = next
}

let dragging = false
let startX = 0
let startY = 0
let startTx = 0
let startTy = 0

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging = true
  startX = e.clientX
  startY = e.clientY
  startTx = tx.value
  startTy = ty.value
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  tx.value = startTx + (e.clientX - startX)
  ty.value = startTy + (e.clientY - startY)
}

function onPointerUp() {
  dragging = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

onBeforeUnmount(onPointerUp)

// 切换图片或模式时回到初始视角，避免残留的极端缩放让人以为图片没加载
watch(() => [props.leftSrc, props.rightSrc, props.mode], reset)

defineExpose({ reset, zoomBy })
</script>

<template>
  <div class="compare-view">
    <!-- 并排 -->
    <div v-if="mode === 'side'" class="stage side">
      <div class="pane" @wheel="onWheel" @pointerdown="onPointerDown">
        <img :src="leftSrc" :style="{ transform, objectFit }" draggable="false" />
        <span class="tag left">{{ leftLabel }}</span>
      </div>
      <div class="divider" />
      <div class="pane" @wheel="onWheel" @pointerdown="onPointerDown">
        <img :src="rightSrc" :style="{ transform, objectFit }" draggable="false" />
        <span class="tag right">{{ rightLabel }}</span>
      </div>
    </div>

    <!-- 滑动擦除 -->
    <div
      v-else-if="mode === 'slider'"
      class="stage single"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
    >
      <img class="layer" :src="leftSrc" :style="{ transform, objectFit }" draggable="false" />
      <img
        class="layer"
        :src="rightSrc"
        :style="{ transform, objectFit, clipPath: `inset(0 0 0 ${split}%)` }"
        draggable="false"
      />
      <div class="split-line" :style="{ left: `${split}%` }">
        <span class="handle"><el-icon><DCaret style="transform: rotate(90deg)" /></el-icon></span>
      </div>
      <span class="tag left">{{ leftLabel }}</span>
      <span class="tag right">{{ rightLabel }}</span>
    </div>

    <!-- 差异混合 -->
    <div v-else class="stage single diff" @wheel="onWheel" @pointerdown="onPointerDown">
      <img class="layer" :src="leftSrc" :style="{ transform, objectFit }" draggable="false" />
      <img
        class="layer blend"
        :src="rightSrc"
        :style="{ transform, objectFit }"
        draggable="false"
      />
      <span class="tag left">差异叠加（越黑越相似）</span>
    </div>

    <div class="controls no-select">
      <el-button-group size="small">
        <el-button @click="zoomBy(1 / 1.25)"><el-icon><ZoomOut /></el-icon></el-button>
        <el-button @click="zoomBy(1.25)"><el-icon><ZoomIn /></el-icon></el-button>
        <el-button @click="reset()"><el-icon><Refresh /></el-icon></el-button>
      </el-button-group>
      <span class="zoom">{{ zoomText }}</span>
      <div v-if="mode === 'slider'" class="split-slider">
        <el-slider v-model="split" :min="0" :max="100" :step="1" size="small" />
      </div>
      <span class="hint">滚轮缩放 · 拖拽平移 · 两图视角同步</span>
    </div>
  </div>
</template>

<style scoped>
.compare-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
}
.stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  background: var(--pm-bg-soft);
  border: 1px solid var(--pm-border);
  border-radius: 10px;
  overflow: hidden;
}
.stage.side .pane {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  cursor: grab;
}
.stage.side .pane:active {
  cursor: grabbing;
}
.divider {
  width: 1px;
  background: var(--pm-border);
}
.stage.single {
  cursor: grab;
}
.stage.single:active {
  cursor: grabbing;
}
.stage img {
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-drag: none;
}
.stage .layer {
  position: absolute;
  inset: 0;
}
.stage.diff {
  background: #000;
}
.layer.blend {
  mix-blend-mode: difference;
}
.split-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--pm-primary);
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.7);
  pointer-events: none;
}
.split-line .handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--pm-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}
.tag {
  position: absolute;
  top: 8px;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.tag.left {
  left: 8px;
}
.tag.right {
  right: 8px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.zoom {
  font-size: 12px;
  color: var(--pm-text-soft);
  min-width: 42px;
}
.split-slider {
  width: 180px;
}
.hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--pm-text-soft);
}
</style>
