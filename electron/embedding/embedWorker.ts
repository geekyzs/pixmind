import { parentPort } from 'node:worker_threads'
import { ClipEngine } from './clipEngine'

/**
 * Embedding Worker 线程
 * 独立线程运行 CLIP 图像编码，避免阻塞主进程与 UI。
 *
 * 消息协议：
 *   主线程 -> Worker: { type: 'init' }
 *                     { type: 'encode', id: number, path: string }
 *   Worker -> 主线程: { type: 'ready', available: boolean }
 *                     { type: 'result', id, vector, dim } | { type: 'error', id, message }
 */

const engine = new ClipEngine()

if (!parentPort) {
  throw new Error('必须在 Worker 线程中运行')
}

parentPort.on('message', async (msg: any) => {
  if (msg.type === 'init') {
    const available = await engine.init()
    parentPort!.postMessage({ type: 'ready', available })
    return
  }

  if (msg.type === 'encode') {
    if (!engine.isAvailable()) {
      parentPort!.postMessage({ type: 'error', id: msg.id, message: 'engine unavailable' })
      return
    }
    try {
      const vector = await engine.encodeImage(msg.path)
      // 转成可转移的 ArrayBuffer 传回，减少拷贝
      const copy = Float32Array.from(vector)
      parentPort!.postMessage(
        { type: 'result', id: msg.id, dim: copy.length, buffer: copy.buffer },
        [copy.buffer]
      )
    } catch (e: any) {
      parentPort!.postMessage({ type: 'error', id: msg.id, message: String(e?.message || e) })
    }
  }
})
