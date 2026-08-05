<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { SearchFilter } from '@shared/types'

/**
 * 侧边栏：多目录管理、收藏、标签筛选、格式筛选、主题切换。
 */
const store = useAppStore()
const { dirs, tags, settings, filter } = storeToRefs(store)

const activeDirIds = ref<Set<number>>(new Set())
const activeTagIds = ref<Set<number>>(new Set())
const favoriteOnly = ref(false)

const isDark = computed(() => settings.value.theme === 'dark')

function buildFilter(): SearchFilter {
  return {
    dirIds: activeDirIds.value.size ? [...activeDirIds.value] : undefined,
    tagIds: activeTagIds.value.size ? [...activeTagIds.value] : undefined,
    favoriteOnly: favoriteOnly.value || undefined,
    keyword: filter.value.keyword
  }
}

function apply() {
  store.applyFilter(buildFilter())
}

function toggleDirFilter(id: number) {
  if (activeDirIds.value.has(id)) activeDirIds.value.delete(id)
  else activeDirIds.value.add(id)
  activeDirIds.value = new Set(activeDirIds.value)
  apply()
}

function toggleTagFilter(id: number) {
  if (activeTagIds.value.has(id)) activeTagIds.value.delete(id)
  else activeTagIds.value.add(id)
  activeTagIds.value = new Set(activeTagIds.value)
  apply()
}

function toggleFavoriteFilter() {
  favoriteOnly.value = !favoriteOnly.value
  apply()
}

function showAll() {
  activeDirIds.value = new Set()
  activeTagIds.value = new Set()
  favoriteOnly.value = false
  apply()
}

async function onAddDir() {
  await store.addDir()
}

async function onRemoveDir(id: number, path: string) {
  try {
    await ElMessageBox.confirm(`确定移除目录「${path}」？其索引将被清除（不会删除本地文件）。`, '提示', {
      type: 'warning'
    })
    activeDirIds.value.delete(id)
    await store.removeDir(id)
  } catch {
    /* 取消 */
  }
}

async function onToggleDir(id: number, enabled: boolean) {
  await store.toggleDir(id, enabled)
}

async function onRescan(id: number) {
  await store.rescanDir(id)
  ElMessage.success('已开始重新扫描')
}

const resetting = ref(false)

/** 清空所有图片/向量/标签关联数据并按现有目录重新扫描 */
async function onResetAndRescan() {
  try {
    await ElMessageBox.confirm(
      '将清空所有已索引的图片、向量与标签关联数据，然后按现有目录重新扫描并生成向量。此操作不会删除本地图片文件，但重新扫描与编码可能耗时较久。确定继续？',
      '清空并重新扫描',
      { type: 'warning', confirmButtonText: '清空并重新扫描', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  resetting.value = true
  try {
    await store.resetAndRescan()
    ElMessage.success('已清空数据，正在后台重新扫描并生成向量')
  } catch {
    ElMessage.error('清空并重新扫描失败')
  } finally {
    resetting.value = false
  }
}

async function onDeleteTag(id: number) {
  await window.api.tagDelete(id)
  activeTagIds.value.delete(id)
  await store.loadTags()
  apply()
}

function toggleTheme() {
  store.setTheme(isDark.value ? 'light' : 'dark')
}
</script>

<template>
  <aside class="sidebar no-select">
    <div class="brand">
      <el-icon class="logo"><Picture /></el-icon>
      <span>PixMind</span>
      <el-button class="theme-btn" text circle @click="toggleTheme">
        <el-icon><Moon v-if="isDark" /><Sunny v-else /></el-icon>
      </el-button>
    </div>

    <div class="section">
      <div class="quick">
        <div class="quick-item" @click="showAll">
          <el-icon><Files /></el-icon><span>全部图片</span>
        </div>
        <div class="quick-item" :class="{ active: favoriteOnly }" @click="toggleFavoriteFilter">
          <el-icon><StarFilled /></el-icon><span>收藏</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        <span>目录</span>
        <div class="title-actions">
          <el-tooltip content="清空所有数据并重新扫描" placement="top">
            <el-button
              text
              size="small"
              :loading="resetting"
              @click="onResetAndRescan"
            >
              <el-icon><RefreshRight /></el-icon>
            </el-button>
          </el-tooltip>
          <el-button text size="small" @click="onAddDir">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
      </div>
      <div class="dir-list">
        <div
          v-for="d in dirs"
          :key="d.id"
          class="dir-item"
          :class="{ active: activeDirIds.has(d.id), disabled: !d.enabled }"
        >
          <div class="dir-main" @click="toggleDirFilter(d.id)">
            <el-icon><Folder /></el-icon>
            <span class="dir-name" :title="d.path">{{ d.path.split(/[/\\]/).pop() || d.path }}</span>
            <span class="dir-count">{{ d.imageCount ?? 0 }}</span>
          </div>
          <el-dropdown trigger="click" @command="(c: string) => {
            if (c === 'rescan') onRescan(d.id)
            else if (c === 'toggle') onToggleDir(d.id, !d.enabled)
            else if (c === 'remove') onRemoveDir(d.id, d.path)
          }">
            <el-icon class="dir-more"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rescan">重新扫描</el-dropdown-item>
                <el-dropdown-item command="toggle">{{ d.enabled ? '停用监听' : '启用监听' }}</el-dropdown-item>
                <el-dropdown-item command="remove" divided>移除目录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div v-if="!dirs.length" class="hint">点击 + 添加图片目录</div>
      </div>
    </div>

    <div class="section flex-scroll">
      <div class="section-title"><span>标签</span></div>
      <div class="tag-list">
        <div
          v-for="t in tags"
          :key="t.id"
          class="tag-item"
          :class="{ active: activeTagIds.has(t.id) }"
          @click="toggleTagFilter(t.id)"
        >
          <span class="dot" :style="{ background: t.color }"></span>
          <span class="tag-name">{{ t.name }}</span>
          <span class="tag-count">{{ t.count ?? 0 }}</span>
          <el-icon class="tag-del" @click.stop="onDeleteTag(t.id)"><Close /></el-icon>
        </div>
        <div v-if="!tags.length" class="hint">在预览中为图片添加标签</div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100%;
  background: var(--pm-sidebar);
  border-right: 1px solid var(--pm-border);
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 8px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  padding: 8px 6px 12px;
  -webkit-app-region: drag;
}
.brand .logo {
  color: var(--pm-primary);
  font-size: 22px;
}
.theme-btn {
  margin-left: auto;
  -webkit-app-region: no-drag;
}
.section {
  display: flex;
  flex-direction: column;
}
.flex-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--pm-text-soft);
  padding: 8px 6px 4px;
  text-transform: uppercase;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.quick {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.quick-item,
.dir-item,
.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.12s;
}
.quick-item:hover,
.dir-main:hover,
.tag-item:hover {
  background: var(--pm-bg-soft);
}
.quick-item.active,
.dir-item.active,
.tag-item.active {
  background: var(--pm-primary);
  color: #fff;
}
.dir-item {
  justify-content: space-between;
  padding: 0;
}
.dir-item.disabled {
  opacity: 0.5;
}
.dir-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  flex: 1;
  min-width: 0;
}
.dir-name,
.tag-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dir-count,
.tag-count {
  font-size: 12px;
  opacity: 0.7;
}
.dir-more {
  padding: 0 8px;
  cursor: pointer;
  color: var(--pm-text-soft);
}
.tag-item .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-del {
  opacity: 0;
  font-size: 12px;
}
.tag-item:hover .tag-del {
  opacity: 0.7;
}
.hint {
  font-size: 12px;
  color: var(--pm-text-soft);
  padding: 8px 10px;
}
</style>
