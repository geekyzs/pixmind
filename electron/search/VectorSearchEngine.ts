/**
 * 可插拔向量搜索引擎抽象接口
 *
 * 业务层只依赖此接口，不关心底层实现。
 * 当前提供 MemoryVectorIndex（内存 + Cosine Similarity）。
 * 未来可无缝替换为 SqliteVecIndex / QdrantIndex 等，
 * 只需实现该接口并在工厂中切换，业务代码零改动。
 */

export interface VectorHit {
  imageId: number
  score: number
}

export interface VectorSearchEngine {
  /** 引擎名称 */
  readonly name: string

  /** 初始化（例如从 DB 加载全部向量到内存 / 连接远程库） */
  init(): Promise<void>

  /** 新增或更新一条向量 */
  upsert(imageId: number, vector: Float32Array): Promise<void>

  /** 批量新增（初始化加载用） */
  upsertBatch(items: Array<{ imageId: number; vector: Float32Array }>): Promise<void>

  /** 删除一条向量 */
  remove(imageId: number): Promise<void>

  /**
   * 查询最相似的 topK 个向量
   * @param query 查询向量（应已归一化或引擎内部归一化）
   * @param topK  返回数量
   * @param candidateIds 可选：仅在这些 id 范围内检索（用于过滤后搜索）
   */
  search(query: Float32Array, topK: number, candidateIds?: Set<number>): Promise<VectorHit[]>

  /** 当前索引中的向量数 */
  size(): number
}
