import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { imageRepo, dirRepo } from '../db/repository'
import { isImageFile, getFormat } from './fileUtils'
import { emitProgress, bus, BusEvent } from '../core/bus'
import type { ImageRecord } from '../../shared/types'

/** 递归遍历目录收集图片文件路径 */
async function walk(dir: string, out: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // 跳过隐藏目录
      if (entry.name.startsWith('.')) continue
      await walk(full, out)
    } else if (entry.isFile() && isImageFile(full)) {
      out.push(full)
    }
  }
}

/** 读取单张图片元数据并写入数据库（增量：mtime 未变则跳过） */
export async function indexImage(filePath: string, dirId: number): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath)
    const existing = imageRepo.getByPath(filePath)
    // 增量更新：文件未变化则跳过
    if (existing && existing.mtime === Math.floor(stat.mtimeMs)) {
      return existing.id
    }

    let width = 0
    let height = 0
    try {
      const meta = await sharp(filePath).metadata()
      width = meta.width || 0
      height = meta.height || 0
    } catch {
      // 元数据读取失败仍记录文件
    }

    const rec: Omit<ImageRecord, 'id' | 'favorite' | 'embedded'> = {
      path: filePath,
      filename: path.basename(filePath),
      dirId,
      width,
      height,
      size: stat.size,
      format: getFormat(filePath),
      mtime: Math.floor(stat.mtimeMs),
      createdAt: Date.now()
    }
    const id = imageRepo.upsert(rec)
    return id
  } catch {
    return null
  }
}

/**
 * 扫描单个目录，建立/更新索引（增量）
 * @returns 新增或更新的图片数
 */
export async function scanDir(dirId: number): Promise<number> {
  const dir = dirRepo.get(dirId)
  if (!dir || !dir.enabled) return 0

  const files: string[] = []
  await walk(dir.path, files)

  const total = files.length
  let done = 0
  emitProgress({ type: 'scan', total, done, running: true, message: `扫描 ${dir.path}` })

  for (const file of files) {
    const id = await indexImage(file, dirId)
    done++
    if (id !== null) {
      const img = imageRepo.get(id)
      if (img) bus.emit(BusEvent.IMAGE_ADDED, img)
    }
    if (done % 20 === 0 || done === total) {
      emitProgress({ type: 'scan', total, done, running: done < total, message: dir.path })
    }
  }

  emitProgress({ type: 'scan', total, done, running: false, message: '扫描完成' })
  return total
}

/** 扫描所有启用的目录 */
export async function scanAll(): Promise<void> {
  const dirs = dirRepo.list().filter((d) => d.enabled)
  for (const d of dirs) {
    await scanDir(d.id)
  }
}
