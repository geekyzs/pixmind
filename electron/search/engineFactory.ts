import type { VectorSearchEngine } from './VectorSearchEngine'
import { MemoryVectorIndex } from './MemoryVectorIndex'

export type EngineType = 'memory' | 'sqlite-vec' | 'qdrant'

/**
 * 搜索引擎工厂
 *
 * 这是切换向量检索实现的唯一位置。业务层通过 getSearchEngine() 获取单例，
 * 未来升级为 sqlite-vec / Qdrant 时，仅需在此新增分支并实现对应 Engine，
 * 无需改动任何业务代码。
 */
let instance: VectorSearchEngine | null = null

export function createSearchEngine(type: EngineType = 'memory'): VectorSearchEngine {
  switch (type) {
    case 'memory':
      return new MemoryVectorIndex()
    // case 'sqlite-vec':
    //   return new SqliteVecIndex()
    // case 'qdrant':
    //   return new QdrantIndex({ url: '...' })
    default:
      return new MemoryVectorIndex()
  }
}

export function getSearchEngine(): VectorSearchEngine {
  if (!instance) instance = createSearchEngine('memory')
  return instance
}

export async function initSearchEngine(type: EngineType = 'memory'): Promise<VectorSearchEngine> {
  instance = createSearchEngine(type)
  await instance.init()
  return instance
}
