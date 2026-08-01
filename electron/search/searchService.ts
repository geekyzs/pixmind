import { getSearchEngine } from '../search/engineFactory'
import { embeddingManager } from '../embedding/embeddingManager'
import { imageRepo } from '../db/repository'
import { getDb } from '../db/database'
import type { SearchResult, SearchFilter } from '../../shared/types'

/**
 * 搜索业务层
 * 只依赖 VectorSearchEngine 抽象接口与 embeddingManager，
 * 不关心底层向量检索实现，天然支持后续替换为 sqlite-vec / Qdrant。
 */

/** 根据过滤条件构造候选 id 集合（用于“过滤后再向量搜索”） */
function buildCandidateSet(filter?: SearchFilter): Set<number> | undefined {
  if (!filter) return undefined
  const hasFilter =
    filter.favoriteOnly ||
    filter.format ||
    (filter.dirIds && filter.dirIds.length) ||
    (filter.tagIds && filter.tagIds.length) ||
    filter.keyword
  if (!hasFilter) return undefined

  const db = getDb()
  const where: string[] = []
  const params: any[] = []
  if (filter.keyword) {
    where.push('i.filename LIKE ?')
    params.push(`%${filter.keyword}%`)
  }
  if (filter.favoriteOnly) where.push('i.favorite = 1')
  if (filter.format) {
    where.push('i.format = ?')
    params.push(filter.format)
  }
  if (filter.dirIds && filter.dirIds.length) {
    where.push(`i.dirId IN (${filter.dirIds.map(() => '?').join(',')})`)
    params.push(...filter.dirIds)
  }
  let join = ''
  if (filter.tagIds && filter.tagIds.length) {
    join = `JOIN image_tags it ON it.imageId = i.id AND it.tagId IN (${filter.tagIds
      .map(() => '?')
      .join(',')})`
    params.push(...filter.tagIds)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT DISTINCT i.id FROM images i ${join} ${whereSql}`)
    .all(...params) as Array<{ id: number }>
  return new Set(rows.map((r) => r.id))
}

async function runVectorSearch(
  vector: Float32Array,
  topK: number,
  filter?: SearchFilter,
  excludeId?: number
): Promise<SearchResult[]> {
  const engine = getSearchEngine()
  const candidates = buildCandidateSet(filter)
  const hits = await engine.search(vector, topK + (excludeId ? 1 : 0), candidates)
  const filtered = excludeId ? hits.filter((h) => h.imageId !== excludeId) : hits
  const ids = filtered.slice(0, topK).map((h) => h.imageId)
  const images = imageRepo.getByIds(ids)
  const scoreMap = new Map(filtered.map((h) => [h.imageId, h.score]))
  return images.map((image) => ({ image, score: scoreMap.get(image.id) ?? 0 }))
}

export const searchService = {
  /** 文本搜图 */
  async byText(text: string, topK = 100, filter?: SearchFilter): Promise<SearchResult[]> {
    const vector = await embeddingManager.encodeText(text)
    if (!vector) return []
    return runVectorSearch(vector, topK, filter)
  },

  /** 以图搜图（库内图片 id） */
  async byImageId(imageId: number, topK = 100, filter?: SearchFilter): Promise<SearchResult[]> {
    const img = imageRepo.get(imageId)
    if (!img) return []
    // 重新编码该图片得到查询向量，并在结果中排除自身
    const vector = await embeddingManager.encodeImageOnce(img.path)
    if (!vector) return []
    return runVectorSearch(vector, topK, filter, imageId)
  },

  /** 以图搜图（外部文件路径） */
  async byImagePath(filePath: string, topK = 100, filter?: SearchFilter): Promise<SearchResult[]> {
    const vector = await embeddingManager.encodeImageOnce(filePath)
    if (!vector) return []
    return runVectorSearch(vector, topK, filter)
  }
}
