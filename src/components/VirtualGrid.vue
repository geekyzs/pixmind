<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { ImageRecord } from '@shared/types'
import LazyThumb from './LazyThumb.vue'

/**
 * 虚拟滚动网格
 * 只渲染可视区域附近的行，支持约 1 万张图片流畅滚动。
 * 通过监听滚动位置计算 startRow/endRow，配合 padding 撑起总高度。
 */
const props = defineProps<{
  items: ImageRecord[]
  itemSize: number // 单元格边长（含图片区）
  gap: number
  scores?: Map<number, number> // 搜索相似度分数
  /** 是否允许与「被搜图」对比（仅以图搜图结果有意义） */
  comparable?: boolean
  /** 多选模式：单击切换勾选而非打开预览 */
  selectionMode?: boolean
  /** 已选中的图片 id 集合 */
  selectedIds?: Set<number>
}>()

const emit = defineEmits<{
  (e: 'open', img: ImageRecord, index: number): void
  (e: 'reach-end'): void
  (e: 'context', img: ImageRecord, event: MouseEvent): void
  (e: 'compare', img: ImageRecord): void
  (e: 'toggle-select', img: ImageRecord): void
}>()

function isSelected(id: number): boolean {
  return props.selectedIds?.has(id) ?? false
}

/** 单击：多选模式下切换勾选，否则打开预览 */
function onCellClick(img: ImageRecord, index: number) {
  if (props.selectionMode) emit('toggle-select', img)
  else emit('open', img, index)
}

const container = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const containerWidth = ref(0)

const CELL_LABEL_H = 34 // 文件名区域高度
const cellHeight = computed(() => props.itemSize + CELL_LABEL_H)

const columns = computed(() => {
  const w = containerWidth.value
  if (!w) return 1
  return Math.max(1, Math.floor((w + props.gap) / (props.itemSize + props.gap)))
})

const rowHeight = computed(() => cellHeight.value + props.gap)
const totalRows = computed(() => Math.ceil(props.items.length / columns.value))
const totalHeight = computed(() => totalRows.value * rowHeight.value)

const BUFFER = 3
const startRow = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - BUFFER))
const visibleRows = computed(() => Math.ceil(viewportHeight.value / rowHeight.value) + BUFFER * 2)
const endRow = computed(() => Math.min(totalRows.value, startRow.value + visibleRows.value))

interface Cell {
  img: ImageRecord
  index: number
  top: number
  left: number
}

const visibleCells = computed<Cell[]>(() => {
  const cells: Cell[] = []
  const cols = columns.value
  for (let row = startRow.value; row < endRow.value; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col
      if (index >= props.items.length) break
      cells.push({
        img: props.items[index],
        index,
        top: row * rowHeight.value,
        left: col * (props.itemSize + props.gap)
      })
    }
  }
  return cells
})

function onScroll() {
  if (!container.value) return
  scrollTop.value = container.value.scrollTop
  // 接近底部触发加载更多
  const { scrollHeight, clientHeight } = container.value
  if (scrollTop.value + clientHeight >= scrollHeight - rowHeight.value * 2) {
    emit('reach-end')
  }
}

let ro: ResizeObserver | null = null
function measure() {
  if (!container.value) return
  viewportHeight.value = container.value.clientHeight
  containerWidth.value = container.value.clientWidth
}

onMounted(() => {
  measure()
  ro = new ResizeObserver(() => measure())
  if (container.value) ro.observe(container.value)
})

onBeforeUnmount(() => ro?.disconnect())

// items 变化（如切换搜索）时回到顶部
watch(
  () => props.items,
  () => {
    if (container.value) {
      container.value.scrollTop = 0
      scrollTop.value = 0
    }
    nextTick(measure)
  }
)

function scoreText(id: number): string | null {
  const s = props.scores?.get(id)
  if (s == null) return null
  return `${(s * 100).toFixed(1)}%`
}

/**
 * 相似度分级：用于把高相似度结果在视觉上区分出来。
 *  high  极相似（绿色 + 高亮边框）
 *  mid   较相似（蓝色）
 *  low   一般（灰色）
 */
function scoreLevel(id: number): 'high' | 'mid' | 'low' | null {
  const s = props.scores?.get(id)
  if (s == null) return null
  if (s >= 0.8) return 'high'
  if (s >= 0.6) return 'mid'
  return 'low'
}
</script>

<template>
  <div ref="container" class="vgrid" @scroll.passive="onScroll">
    <div class="vgrid-phantom" :style="{ height: totalHeight + 'px' }">
      <div
        v-for="cell in visibleCells"
        :key="cell.img.id"
        class="cell"
        :class="[
          scoreLevel(cell.img.id) ? `sim-${scoreLevel(cell.img.id)}` : '',
          { selected: isSelected(cell.img.id), selecting: selectionMode }
        ]"
        :style="{
          transform: `translate(${cell.left}px, ${cell.top}px)`,
          width: itemSize + 'px',
          height: cellHeight + 'px'
        }"
        @click="onCellClick(cell.img, cell.index)"
        @contextmenu.prevent="emit('context', cell.img, $event)"
      >
        <div class="thumb-wrap" :style="{ height: itemSize + 'px' }">
          <LazyThumb :path="cell.img.path" />
          <div
            v-if="selectionMode"
            class="checkbox"
            :class="{ checked: isSelected(cell.img.id) }"
          >
            <el-icon v-if="isSelected(cell.img.id)"><Check /></el-icon>
          </div>
          <div v-if="cell.img.favorite" class="badge fav">
            <el-icon><StarFilled /></el-icon>
          </div>
          <div
            v-if="scoreText(cell.img.id)"
            class="badge score"
            :class="`score-${scoreLevel(cell.img.id)}`"
          >
            {{ scoreText(cell.img.id) }}
          </div>
          <div v-if="!cell.img.embedded" class="badge pending" title="等待生成 Embedding">
            <el-icon><Clock /></el-icon>
          </div>
          <button
            v-if="comparable && !selectionMode"
            class="compare-btn"
            title="与被搜图对比"
            @click.stop="emit('compare', cell.img)"
          >
            <el-icon><Switch /></el-icon>
            <span>对比</span>
          </button>
        </div>
        <div class="label" :title="cell.img.filename">{{ cell.img.filename }}</div>
      </div>
    </div>
    <div v-if="items.length === 0" class="empty">
      <el-icon><PictureFilled /></el-icon>
      <span>暂无图片</span>
    </div>
  </div>
</template>

<style scoped>
.vgrid {
  position: relative;
  height: 100%;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
}
.vgrid-phantom {
  position: relative;
  width: 100%;
}
.cell {
  position: absolute;
  top: 0;
  left: 0;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: var(--pm-bg-card);
  box-shadow: var(--pm-shadow);
  transition: transform 0.12s;
}
.cell:hover {
  outline: 2px solid var(--pm-primary);
}
/* 多选模式：选中态高亮 */
.cell.selected {
  outline: 2px solid var(--pm-primary);
  box-shadow: 0 0 0 1px var(--pm-primary), 0 4px 18px rgba(64, 158, 255, 0.35);
}
.cell.selecting {
  cursor: pointer;
}
/* 勾选框 */
.checkbox {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
.checkbox.checked {
  background: var(--pm-primary);
  border-color: var(--pm-primary);
}
/* 高相似度：绿色高亮边框 + 轻微放大 */
.cell.sim-high {
  outline: 2px solid #35c46a;
  box-shadow: 0 0 0 1px #35c46a, 0 4px 18px rgba(53, 196, 106, 0.35);
}
.cell.sim-high:hover {
  outline: 2px solid #35c46a;
}
/* 中相似度：蓝色细边框 */
.cell.sim-mid {
  outline: 1px solid var(--pm-primary);
}
.thumb-wrap {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.label {
  font-size: 12px;
  padding: 6px 8px;
  height: 34px;
  color: var(--pm-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  position: absolute;
  border-radius: 6px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  backdrop-filter: blur(6px);
}
.badge.fav {
  top: 6px;
  right: 6px;
  color: #ffd54f;
  background: rgba(0, 0, 0, 0.35);
}
.badge.score {
  bottom: 6px;
  left: 6px;
  color: #fff;
  font-weight: 600;
}
/* 相似度分级配色 */
.badge.score.score-high {
  background: rgba(53, 196, 106, 0.92);
  box-shadow: 0 0 8px rgba(53, 196, 106, 0.6);
}
.badge.score.score-mid {
  background: rgba(64, 158, 255, 0.88);
}
.badge.score.score-low {
  background: rgba(120, 120, 130, 0.8);
}
.badge.pending {
  top: 6px;
  left: 6px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
}
/* 对比入口：仅 hover 时浮现，避免持续遮挡画面 */
.compare-btn {
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 11px;
  color: #fff;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.cell:hover .compare-btn {
  opacity: 1;
}
.compare-btn:hover {
  background: var(--pm-primary);
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--pm-text-soft);
  font-size: 15px;
}
.empty .el-icon {
  font-size: 48px;
}
</style>
