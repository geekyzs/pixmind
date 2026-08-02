<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import CompareView from './CompareView.vue'
import type { ImageRecord } from '@shared/types'

/**
 * 「被搜图 vs 搜索结果」对比对话框
 *
 * 以图搜图只给出一个相似度数字，用户无法判断这个分数为何而来。
 * 本视图把查询图与某张结果图放在同一视角下逐像素比对，
 * 并列出尺寸/体积/格式等客观差异，用于确认是否为重复图、不同分辨率版本或误检。
 */
const props = defineProps<{
  modelValue: boolean
  /** 初始对比的结果图；为空时取相似度最高的一张 */
  target: ImageRecord | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useAppStore()
const { querySource, searchResults, searchScores } = storeToRefs(store)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const mode = ref<'side' | 'slider' | 'diff'>('side')
const fit = ref<'contain' | 'cover'>('contain')
const index = ref(0)

const results = computed(() => searchResults.value ?? [])
const current = computed<ImageRecord | null>(() => results.value[index.value] ?? null)

function localUrl(p: string): string {
  return `pixmind://${encodeURIComponent(p)}`
}

const leftSrc = computed(() => (querySource.value ? localUrl(querySource.value.path) : ''))
const rightSrc = computed(() => (current.value ? localUrl(current.value.path) : ''))

const score = computed(() => {
  if (!current.value) return null
  return searchScores.value.get(current.value.id) ?? null
})
const scorePercent = computed(() => (score.value == null ? null : score.value * 100))
const scoreLevel = computed<'high' | 'mid' | 'low' | null>(() => {
  if (score.value == null) return null
  if (score.value >= 0.8) return 'high'
  if (score.value >= 0.6) return 'mid'
  return 'low'
})
const scoreTagType = computed(() =>
  scoreLevel.value === 'high' ? 'success' : scoreLevel.value === 'mid' ? 'primary' : 'info'
)

/** 相似度的人话解释：避免用户把余弦相似度当成「重复度」误读 */
const scoreAdvice = computed(() => {
  if (score.value == null) return ''
  if (score.value >= 0.95) return '几乎可判定为同一张图（可能是重复文件或不同压缩版本）'
  if (score.value >= 0.8) return '语义高度接近，通常是同场景或同主体的不同拍摄'
  if (score.value >= 0.6) return '存在明显共同元素，但并非同一画面'
  return '相关性较弱，可能只是构图或色调相近'
})

function fmtSize(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fmtDate(ts?: number): string {
  return ts ? new Date(ts).toLocaleString() : '—'
}

function ratio(w?: number, h?: number): string {
  if (!w || !h) return '—'
  return (w / h).toFixed(3)
}

function px(w?: number, h?: number): string {
  if (!w || !h) return '—'
  return `${w} × ${h}`
}

interface DiffRow {
  label: string
  left: string
  right: string
  /** 是否存在差异，用于高亮 */
  diff: boolean
  /** 差异的量化描述，如 “+2.4 MB” */
  delta?: string
}

const q = computed(() => querySource.value?.meta ?? null)

const diffRows = computed<DiffRow[]>(() => {
  const a = q.value
  const b = current.value
  if (!b) return []

  const rows: DiffRow[] = []

  rows.push({
    label: '文件名',
    left: querySource.value?.filename ?? '—',
    right: b.filename,
    diff: (querySource.value?.filename ?? '') !== b.filename
  })

  const aPx = (a?.width ?? 0) * (a?.height ?? 0)
  const bPx = b.width * b.height
  rows.push({
    label: '分辨率',
    left: px(a?.width, a?.height),
    right: px(b.width, b.height),
    diff: a ? a.width !== b.width || a.height !== b.height : false,
    delta:
      aPx > 0 && bPx > 0 && aPx !== bPx
        ? `${bPx > aPx ? '+' : '-'}${Math.abs(Math.round((bPx / aPx - 1) * 100))}% 像素`
        : undefined
  })

  rows.push({
    label: '宽高比',
    left: ratio(a?.width, a?.height),
    right: ratio(b.width, b.height),
    diff: a ? Math.abs(a.width / a.height - b.width / b.height) > 0.01 : false
  })

  rows.push({
    label: '文件大小',
    left: fmtSize(a?.size),
    right: fmtSize(b.size),
    diff: a ? a.size !== b.size : false,
    delta:
      a && a.size !== b.size
        ? `${b.size > a.size ? '+' : '-'}${fmtSize(Math.abs(b.size - a.size))}`
        : undefined
  })

  rows.push({
    label: '格式',
    left: a?.format ? a.format.toUpperCase() : '—',
    right: b.format.toUpperCase(),
    diff: a ? a.format !== b.format : false
  })

  rows.push({
    label: '修改时间',
    left: fmtDate(a?.mtime),
    right: fmtDate(b.mtime),
    diff: a ? a.mtime !== b.mtime : false
  })

  rows.push({
    label: '路径',
    left: querySource.value?.path ?? '—',
    right: b.path,
    diff: (querySource.value?.path ?? '') !== b.path
  })

  return rows
})

/** 同名 + 同尺寸 + 同体积，基本可断定是重复文件 */
const isLikelyDuplicate = computed(() => {
  const a = q.value
  const b = current.value
  if (!a || !b) return false
  return a.size === b.size && a.width === b.width && a.height === b.height && a.path !== b.path
})

function prev() {
  if (index.value > 0) index.value--
}
function next() {
  if (index.value < results.value.length - 1) index.value++
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}

/** 打开时定位到指定结果，未指定则取排序最前（相似度最高）的一张 */
watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    const i = props.target ? results.value.findIndex((r) => r.id === props.target!.id) : 0
    index.value = i >= 0 ? i : 0
  }
)
</script>

<template>
  <el-dialog
    v-model="visible"
    width="88%"
    top="4vh"
    class="compare-dialog"
    :destroy-on-close="true"
    append-to-body
  >
    <template #header>
      <div class="dlg-header no-select">
        <span class="title">搜图结果对比</span>
        <el-tag v-if="scorePercent != null" :type="scoreTagType" effect="dark" size="small">
          相似度 {{ scorePercent.toFixed(1) }}%
        </el-tag>
        <el-tag v-if="isLikelyDuplicate" type="warning" size="small">疑似重复文件</el-tag>
        <span class="pager">{{ index + 1 }} / {{ results.length }}</span>
      </div>
    </template>

    <div v-if="!querySource" class="placeholder">
      当前不是「以图搜图」结果，无可对比的查询图
    </div>

    <div v-else-if="!current" class="placeholder">没有可对比的搜索结果</div>

    <div v-else class="compare-body" tabindex="0" @keydown="onKey">
      <div class="toolbar no-select">
        <el-radio-group v-model="mode" size="small">
          <el-radio-button value="side">并排</el-radio-button>
          <el-radio-button value="slider">滑动</el-radio-button>
          <el-radio-button value="diff">差异</el-radio-button>
        </el-radio-group>

        <el-radio-group v-model="fit" size="small">
          <el-radio-button value="contain">完整</el-radio-button>
          <el-radio-button value="cover">填充</el-radio-button>
        </el-radio-group>

        <div class="nav">
          <el-button size="small" :disabled="index === 0" @click="prev">
            <el-icon><ArrowLeft /></el-icon> 上一张
          </el-button>
          <el-button size="small" :disabled="index >= results.length - 1" @click="next">
            下一张 <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>

      <div class="stage-wrap">
        <CompareView
          :left-src="leftSrc"
          :right-src="rightSrc"
          :left-label="`被搜图 · ${querySource.filename}`"
          :right-label="`结果 · ${current.filename}`"
          :mode="mode"
          :fit="fit"
        />
      </div>

      <div class="analysis">
        <div class="score-block">
          <el-progress
            type="dashboard"
            :percentage="Math.round(scorePercent ?? 0)"
            :width="96"
            :color="
              scoreLevel === 'high' ? '#35c46a' : scoreLevel === 'mid' ? '#409eff' : '#909399'
            "
          />
          <p class="advice">{{ scoreAdvice }}</p>
        </div>

        <table class="diff-table">
          <thead>
            <tr>
              <th class="k">属性</th>
              <th>被搜图</th>
              <th>结果图</th>
              <th class="d">差异</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in diffRows" :key="row.label" :class="{ changed: row.diff }">
              <td class="k">{{ row.label }}</td>
              <td :title="row.left">{{ row.left }}</td>
              <td :title="row.right">{{ row.right }}</td>
              <td class="d">
                <span v-if="row.delta" class="delta">{{ row.delta }}</span>
                <el-icon v-else-if="row.diff" class="ne"><Close /></el-icon>
                <el-icon v-else class="eq"><Check /></el-icon>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.dlg-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dlg-header .title {
  font-size: 16px;
  font-weight: 600;
}
.pager {
  margin-left: auto;
  margin-right: 28px;
  font-size: 12px;
  color: var(--pm-text-soft);
}
.placeholder {
  padding: 60px 0;
  text-align: center;
  color: var(--pm-text-soft);
}
.compare-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  outline: none;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.toolbar .nav {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.stage-wrap {
  height: 52vh;
  min-height: 300px;
}
.analysis {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.score-block {
  width: 190px;
  flex-shrink: 0;
  text-align: center;
}
.advice {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pm-text-soft);
}
.diff-table {
  flex: 1;
  min-width: 0;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
.diff-table th,
.diff-table td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--pm-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-table th {
  color: var(--pm-text-soft);
  font-weight: 500;
}
.diff-table .k {
  width: 84px;
  color: var(--pm-text-soft);
}
.diff-table .d {
  width: 110px;
  text-align: right;
}
.diff-table tr.changed td:not(.k) {
  color: #e6a23c;
}
.delta {
  font-weight: 600;
}
.eq {
  color: #35c46a;
}
.ne {
  color: #e6a23c;
}
</style>
