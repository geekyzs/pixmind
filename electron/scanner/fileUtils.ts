import path from 'node:path'

/** 支持的图片扩展名 */
export const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  '.heic'
])

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

export function getFormat(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace('.', '')
}
