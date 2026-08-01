import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { getThumbDir } from '../db/database'

/**
 * 缩略图服务
 * 为瀑布流/网格生成小尺寸缩略图并缓存，减少大图渲染开销，提升列表流畅度。
 */

const THUMB_SIZE = 300

function thumbPathFor(imagePath: string): string {
  const hash = crypto.createHash('md5').update(imagePath).digest('hex')
  return path.join(getThumbDir(), `${hash}.webp`)
}

/** 获取缩略图路径，不存在则生成 */
export async function getThumbnail(imagePath: string): Promise<string | null> {
  try {
    const thumb = thumbPathFor(imagePath)
    if (fs.existsSync(thumb)) return thumb
    if (!fs.existsSync(imagePath)) return null

    await sharp(imagePath)
      .rotate() // 依据 EXIF 自动旋转
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(thumb)
    return thumb
  } catch {
    return null
  }
}
