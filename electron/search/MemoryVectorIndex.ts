import type { VectorSearchEngine, VectorHit } from './VectorSearchEngine'
import { embeddingRepo } from '../db/repository'

/** 就地 L2 归一化 */
function normalize(v: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

/** 两个已归一化向量的点积即余弦相似度 */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/**
 * 内存向量索引：启动时全量加载到内存，暴力遍历计算 Cosine Similarity。
 * 对于约 1 万张图片（512 维）性能在毫秒级。
 * 存储归一化后的向量，查询时只需点积。
 */
export class MemoryVectorIndex implements VectorSearchEngine {
  readonly name = 'memory'
  private vectors = new Map<number, Float32Array>()

  async init(): Promise<void> {
    this.vectors.clear()
    const all = embeddingRepo.loadAll()
    for (const { imageId, vector } of all) {
      this.vectors.set(imageId, normalize(vector))
    }
  }

  async upsert(imageId: number, vector: Float32Array): Promise<void> {
    this.vectors.set(imageId, normalize(vector))
  }

  async upsertBatch(items: Array<{ imageId: number; vector: Float32Array }>): Promise<void> {
    for (const it of items) this.vectors.set(it.imageId, normalize(it.vector))
  }

  async remove(imageId: number): Promise<void> {
    this.vectors.delete(imageId)
  }

  async search(query: Float32Array, topK: number, candidateIds?: Set<number>): Promise<VectorHit[]> {
    const q = normalize(query)
    const heap: VectorHit[] = []

    const consider = (imageId: number, vec: Float32Array) => {
      const score = dot(q, vec)
      if (heap.length < topK) {
        heap.push({ imageId, score })
        if (heap.length === topK) heap.sort((a, b) => a.score - b.score)
      } else if (score > heap[0].score) {
        // 替换最小值并保持有序（小顶堆的简化实现）
        heap[0] = { imageId, score }
        heap.sort((a, b) => a.score - b.score)
      }
    }

    if (candidateIds) {
      for (const id of candidateIds) {
        const vec = this.vectors.get(id)
        if (vec) consider(id, vec)
      }
    } else {
      for (const [id, vec] of this.vectors) consider(id, vec)
    }

    return heap.sort((a, b) => b.score - a.score)
  }

  size(): number {
    return this.vectors.size
  }
}
