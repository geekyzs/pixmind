import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import { CLIP_CONFIG, getModelPath, MODEL_FILES, modelsAvailable } from './clipConfig'
import { ClipTokenizer } from './clipTokenizer'

/**
 * CLIP 推理引擎（图像 + 文本 -> Embedding）
 * 在 Worker 线程中实例化，避免阻塞主线程 / UI。
 */
export class ClipEngine {
  private imageSession: ort.InferenceSession | null = null
  private textSession: ort.InferenceSession | null = null
  private tokenizer = new ClipTokenizer()
  private available = false

  async init(): Promise<boolean> {
    if (!modelsAvailable()) {
      this.available = false
      return false
    }
    try {
      this.imageSession = await ort.InferenceSession.create(
        getModelPath(MODEL_FILES.imageEncoder)
      )
      this.textSession = await ort.InferenceSession.create(getModelPath(MODEL_FILES.textEncoder))
      this.tokenizer.load()
      this.available = true
      return true
    } catch (e) {
      this.available = false
      return false
    }
  }

  isAvailable(): boolean {
    return this.available
  }

  /** 图片预处理：resize -> center crop -> RGB float -> 归一化 -> CHW 张量 */
  private async preprocessImage(imagePath: string): Promise<ort.Tensor> {
    const size = CLIP_CONFIG.imageSize
    const { data } = await sharp(imagePath)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { mean, std } = CLIP_CONFIG
    const float = new Float32Array(3 * size * size)
    // data 为 HWC (RGB)，转为 CHW 并归一化
    for (let i = 0; i < size * size; i++) {
      const r = data[i * 3] / 255
      const g = data[i * 3 + 1] / 255
      const b = data[i * 3 + 2] / 255
      float[i] = (r - mean[0]) / std[0]
      float[size * size + i] = (g - mean[1]) / std[1]
      float[2 * size * size + i] = (b - mean[2]) / std[2]
    }
    return new ort.Tensor('float32', float, [1, 3, size, size])
  }

  /** 生成图片 Embedding */
  async encodeImage(imagePath: string): Promise<Float32Array> {
    if (!this.imageSession) throw new Error('image session not ready')
    const input = await this.preprocessImage(imagePath)
    const feeds: Record<string, ort.Tensor> = {}
    feeds[this.imageSession.inputNames[0]] = input
    const output = await this.imageSession.run(feeds)
    const out = output[this.imageSession.outputNames[0]]
    return out.data as Float32Array
  }

  /** 生成文本 Embedding */
  async encodeText(text: string): Promise<Float32Array> {
    if (!this.textSession) throw new Error('text session not ready')
    if (!this.tokenizer.isReady()) throw new Error('tokenizer not ready')
    const tokens = this.tokenizer.encode(text)
    const ids = BigInt64Array.from(tokens.map((t) => BigInt(t)))
    const input = new ort.Tensor('int64', ids, [1, tokens.length])
    const feeds: Record<string, ort.Tensor> = {}
    feeds[this.textSession.inputNames[0]] = input
    const output = await this.textSession.run(feeds)
    const out = output[this.textSession.outputNames[0]]
    return out.data as Float32Array
  }
}
