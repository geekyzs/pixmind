import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { app } from 'electron'
import { imageRepo, embeddingRepo, settingsRepo } from '../db/repository'
import { getSearchEngine } from '../search/engineFactory'
import { emitProgress, bus, BusEvent } from '../core/bus'
import { modelsAvailable } from './clipConfig'
import { ClipEngine } from './clipEngine'

interface PendingJob {
  id: number
  path: string
}

/**
 * Embedding 管理器
 * - 维护图片编码 Worker（防止阻塞 UI）
 * - 消费待处理队列，写入 DB 与内存索引
 * - 上报进度事件
 * - 文本编码在主进程内的独立 ClipEngine 完成（轻量、按需触发）
 */
class EmbeddingManager {
  private worker: Worker | null = null
  private available = false
  private queue: PendingJob[] = []
  private inflight = new Map<number, PendingJob>()
  private processing = false
  private total = 0
  private done = 0

  // 文本编码引擎（主进程内，供文本搜图即时调用）
  private textEngine = new ClipEngine()
  private textReady = false

  async start(): Promise<void> {
    if (!modelsAvailable()) {
      console.warn('[Embedding] 模型文件缺失，Embedding 功能不可用')
      this.available = false
      return
    }

    // 启动图片编码 worker
    const workerPath = this.resolveWorkerPath()
    this.worker = new Worker(workerPath)
    this.worker.on('message', (msg) => this.onWorkerMessage(msg))
    this.worker.on('error', (err) => console.error('[EmbedWorker]', err))

    await new Promise<void>((resolve) => {
      const handler = (msg: any) => {
        if (msg.type === 'ready') {
          this.available = msg.available
          this.worker?.off('message', handler)
          resolve()
        }
      }
      this.worker!.on('message', handler)
      this.worker!.postMessage({ type: 'init' })
    })

    // 初始化文本引擎
    this.textReady = await this.textEngine.init()

    // 启动时把数据库中未完成的任务入队
    if (this.available) {
      this.enqueuePending()
    }
  }

  private resolveWorkerPath(): string {
    // 打包后 worker 被编译到 dist-electron 目录
    return path.join(__dirname, 'embedWorker.js')
  }

  isAvailable(): boolean {
    return this.available
  }

  /** 把 DB 中所有未生成 embedding 的图片入队 */
  enqueuePending(): void {
    const pending = imageRepo.listPendingEmbedding(100000)
    for (const img of pending) this.enqueue(img.id, img.path)
  }

  enqueue(id: number, filePath: string): void {
    if (!this.available) return
    if (this.inflight.has(id)) return
    if (this.queue.some((j) => j.id === id)) return
    this.queue.push({ id, path: filePath })
    this.total++
    this.pump()
  }

  private pump(): void {
    if (this.processing) return
    this.processing = true
    this.emit()
    this.next()
  }

  private next(): void {
    const autoEmbed = settingsRepo.get<boolean>('autoEmbed', true)
    if (!autoEmbed) {
      this.processing = false
      return
    }
    const job = this.queue.shift()
    if (!job) {
      this.processing = false
      // 队列清空，重置计数
      if (this.inflight.size === 0) {
        this.total = 0
        this.done = 0
      }
      this.emit(false)
      return
    }
    this.inflight.set(job.id, job)
    this.worker?.postMessage({ type: 'encode', id: job.id, path: job.path })
  }

  private onWorkerMessage(msg: any): void {
    if (msg.type === 'result') {
      const job = this.inflight.get(msg.id)
      this.inflight.delete(msg.id)
      if (job) {
        const vector = new Float32Array(msg.buffer)
        try {
          embeddingRepo.save(job.id, vector)
          imageRepo.markEmbedded(job.id)
          void getSearchEngine().upsert(job.id, vector)
          bus.emit(BusEvent.IMAGE_EMBEDDED, job.id)
        } catch (e) {
          console.error('[Embedding] 保存失败', e)
        }
      }
      this.done++
      this.emit()
      this.next()
    } else if (msg.type === 'error') {
      this.inflight.delete(msg.id)
      this.done++
      this.emit()
      this.next()
    }
  }

  private emit(running = true): void {
    emitProgress({
      type: 'embed',
      total: this.total,
      done: this.done,
      running: running && (this.queue.length > 0 || this.inflight.size > 0),
      message: 'Embedding 生成中'
    })
  }

  /** 文本编码（供文本搜图使用） */
  async encodeText(text: string): Promise<Float32Array | null> {
    if (!this.textReady) return null
    try {
      return await this.textEngine.encodeText(text)
    } catch {
      return null
    }
  }

  /** 单张图片同步编码（供以图搜图使用外部图片） */
  async encodeImageOnce(filePath: string): Promise<Float32Array | null> {
    if (!this.textReady && !this.available) return null
    try {
      // 复用文本引擎实例的图像编码能力（同一 ClipEngine 同时含 image session）
      return await this.textEngine.encodeImage(filePath)
    } catch {
      return null
    }
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}

export const embeddingManager = new EmbeddingManager()
