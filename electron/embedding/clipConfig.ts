import path from 'node:path'
import fs from 'node:fs'

/**
 * CLIP 模型配置与路径解析
 *
 * 模型文件（ONNX）放在应用根目录的 models/ 下，打包后通过 extraResources 释放到 resources/models。
 * 需要三个文件：
 *   - clip-image-vit-32.onnx   图像编码器
 *   - clip-text-vit-32.onnx    文本编码器
 *   - vocab.json / merges.txt  BPE tokenizer 词表（文本编码用）
 *
 * 说明：这些模型可从 Hugging Face 的 CLIP ViT-B/32 导出为 ONNX 后放入。
 */

export const CLIP_CONFIG = {
  imageSize: 224,
  embeddingDim: 512,
  // CLIP 官方图像归一化参数
  mean: [0.48145466, 0.4578275, 0.40821073],
  std: [0.26862954, 0.26130258, 0.27577711],
  contextLength: 77
}

/** 解析 models 目录（开发态在项目根，生产态在 resources） */
export function getModelsDir(): string {
  // 生产环境：process.resourcesPath/models
  const prod = process.resourcesPath ? path.join(process.resourcesPath, 'models') : ''
  if (prod && fs.existsSync(prod)) return prod
  // 开发环境：项目根/models
  return path.join(process.cwd(), 'models')
}

export function getModelPath(file: string): string {
  return path.join(getModelsDir(), file)
}

export const MODEL_FILES = {
  imageEncoder: 'clip-image-vit-32.onnx',
  textEncoder: 'clip-text-vit-32.onnx',
  vocab: 'vocab.json',
  merges: 'merges.txt'
}

/** 检查模型文件是否齐全 */
export function modelsAvailable(): boolean {
  return (
    fs.existsSync(getModelPath(MODEL_FILES.imageEncoder)) &&
    fs.existsSync(getModelPath(MODEL_FILES.textEncoder))
  )
}
