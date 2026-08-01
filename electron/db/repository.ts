import { getDb } from './database'
import type {
  ImageRecord,
  WatchDir,
  Tag,
  PageQuery,
  PageResult
} from '../../shared/types'

/* ---------------------------------- 目录 ---------------------------------- */

export const dirRepo = {
  add(dirPath: string): WatchDir {
    const db = getDb()
    const now = Date.now()
    const info = db
      .prepare(
        `INSERT INTO dirs (path, enabled, createdAt) VALUES (?, 1, ?)
         ON CONFLICT(path) DO UPDATE SET enabled = 1`
      )
      .run(dirPath, now)
    const row =
      info.lastInsertRowid > 0
        ? db.prepare('SELECT * FROM dirs WHERE id = ?').get(info.lastInsertRowid)
        : db.prepare('SELECT * FROM dirs WHERE path = ?').get(dirPath)
    return row as WatchDir
  },

  list(): WatchDir[] {
    const db = getDb()
    return db
      .prepare(
        `SELECT d.*, (SELECT COUNT(*) FROM images i WHERE i.dirId = d.id) AS imageCount
         FROM dirs d ORDER BY d.createdAt DESC`
      )
      .all() as WatchDir[]
  },

  remove(id: number): void {
    getDb().prepare('DELETE FROM dirs WHERE id = ?').run(id)
  },

  toggle(id: number, enabled: boolean): void {
    getDb().prepare('UPDATE dirs SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  },

  get(id: number): WatchDir | undefined {
    return getDb().prepare('SELECT * FROM dirs WHERE id = ?').get(id) as WatchDir | undefined
  }
}

/* ---------------------------------- 图片 ---------------------------------- */

export const imageRepo = {
  /** 按路径查询是否存在 */
  getByPath(p: string): ImageRecord | undefined {
    return getDb().prepare('SELECT * FROM images WHERE path = ?').get(p) as
      | ImageRecord
      | undefined
  },

  get(id: number): ImageRecord | undefined {
    return getDb().prepare('SELECT * FROM images WHERE id = ?').get(id) as
      | ImageRecord
      | undefined
  },

  /** 插入或更新（依据 path 唯一） */
  upsert(rec: Omit<ImageRecord, 'id' | 'favorite' | 'embedded'>): number {
    const db = getDb()
    const existing = this.getByPath(rec.path)
    if (existing) {
      db.prepare(
        `UPDATE images SET width=?, height=?, size=?, format=?, mtime=? WHERE id=?`
      ).run(rec.width, rec.height, rec.size, rec.format, rec.mtime, existing.id)
      return existing.id
    }
    const info = db
      .prepare(
        `INSERT INTO images (path, filename, dirId, width, height, size, format, mtime, createdAt, favorite, embedded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      )
      .run(
        rec.path,
        rec.filename,
        rec.dirId,
        rec.width,
        rec.height,
        rec.size,
        rec.format,
        rec.mtime,
        rec.createdAt
      )
    return info.lastInsertRowid as number
  },

  removeByPath(p: string): number | undefined {
    const db = getDb()
    const img = this.getByPath(p)
    if (!img) return undefined
    db.prepare('DELETE FROM images WHERE id = ?').run(img.id)
    return img.id
  },

  setFavorite(id: number, favorite: boolean): void {
    getDb().prepare('UPDATE images SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id)
  },

  markEmbedded(id: number): void {
    getDb().prepare('UPDATE images SET embedded = 1 WHERE id = ?').run(id)
  },

  /** 获取未生成 embedding 的图片 */
  listPendingEmbedding(limit = 500): ImageRecord[] {
    return getDb()
      .prepare('SELECT * FROM images WHERE embedded = 0 LIMIT ?')
      .all(limit) as ImageRecord[]
  },

  countPendingEmbedding(): number {
    const r = getDb().prepare('SELECT COUNT(*) AS c FROM images WHERE embedded = 0').get() as {
      c: number
    }
    return r.c
  },

  /** 分页查询（支持关键词、标签、目录、收藏过滤） */
  page(q: PageQuery): PageResult<ImageRecord> {
    const db = getDb()
    const where: string[] = []
    const params: any[] = []
    const f = q.filter || {}

    if (f.keyword) {
      where.push('i.filename LIKE ?')
      params.push(`%${f.keyword}%`)
    }
    if (f.favoriteOnly) where.push('i.favorite = 1')
    if (f.format) {
      where.push('i.format = ?')
      params.push(f.format)
    }
    if (f.dirIds && f.dirIds.length) {
      where.push(`i.dirId IN (${f.dirIds.map(() => '?').join(',')})`)
      params.push(...f.dirIds)
    }

    let join = ''
    if (f.tagIds && f.tagIds.length) {
      join = `JOIN image_tags it ON it.imageId = i.id AND it.tagId IN (${f.tagIds
        .map(() => '?')
        .join(',')})`
      params.push(...f.tagIds)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sortBy = ['createdAt', 'mtime', 'filename', 'size'].includes(q.sortBy || '')
      ? q.sortBy
      : 'createdAt'
    const order = q.order === 'asc' ? 'ASC' : 'DESC'

    const totalRow = db
      .prepare(`SELECT COUNT(DISTINCT i.id) AS c FROM images i ${join} ${whereSql}`)
      .get(...params) as { c: number }

    const items = db
      .prepare(
        `SELECT DISTINCT i.* FROM images i ${join} ${whereSql}
         ORDER BY i.${sortBy} ${order} LIMIT ? OFFSET ?`
      )
      .all(...params, q.limit, q.offset) as ImageRecord[]

    // 附加标签
    const withTags = items.map((it) => ({ ...it, tags: tagRepo.namesOfImage(it.id) }))
    return { items: withTags, total: totalRow.c }
  },

  /** 按 id 列表批量取（用于搜索结果回填），保持传入顺序 */
  getByIds(ids: number[]): ImageRecord[] {
    if (!ids.length) return []
    const db = getDb()
    const rows = db
      .prepare(`SELECT * FROM images WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as ImageRecord[]
    const map = new Map(rows.map((r) => [r.id, r]))
    return ids
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((it) => ({ ...(it as ImageRecord), tags: tagRepo.namesOfImage((it as ImageRecord).id) }))
  }
}

/* -------------------------------- Embedding -------------------------------- */

export const embeddingRepo = {
  save(imageId: number, vector: Float32Array): void {
    const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
    getDb()
      .prepare(
        `INSERT INTO embeddings (imageId, dim, vector) VALUES (?, ?, ?)
         ON CONFLICT(imageId) DO UPDATE SET dim=excluded.dim, vector=excluded.vector`
      )
      .run(imageId, vector.length, buf)
  },

  /** 加载所有 embedding 到内存 */
  loadAll(): Array<{ imageId: number; vector: Float32Array }> {
    const rows = getDb().prepare('SELECT imageId, dim, vector FROM embeddings').all() as Array<{
      imageId: number
      dim: number
      vector: Buffer
    }>
    return rows.map((r) => ({
      imageId: r.imageId,
      vector: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.dim)
    }))
  },

  remove(imageId: number): void {
    getDb().prepare('DELETE FROM embeddings WHERE imageId = ?').run(imageId)
  }
}

/* ---------------------------------- 标签 ---------------------------------- */

export const tagRepo = {
  list(): Tag[] {
    return getDb()
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM image_tags it WHERE it.tagId = t.id) AS count
         FROM tags t ORDER BY t.name`
      )
      .all() as Tag[]
  },

  create(name: string, color = '#409eff'): Tag {
    const db = getDb()
    const info = db
      .prepare(`INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING`)
      .run(name, color)
    const row =
      info.lastInsertRowid > 0
        ? db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid)
        : db.prepare('SELECT * FROM tags WHERE name = ?').get(name)
    return row as Tag
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
  },

  assign(imageId: number, tagId: number): void {
    getDb()
      .prepare('INSERT OR IGNORE INTO image_tags (imageId, tagId) VALUES (?, ?)')
      .run(imageId, tagId)
  },

  unassign(imageId: number, tagId: number): void {
    getDb().prepare('DELETE FROM image_tags WHERE imageId = ? AND tagId = ?').run(imageId, tagId)
  },

  namesOfImage(imageId: number): string[] {
    const rows = getDb()
      .prepare(
        `SELECT t.name FROM tags t JOIN image_tags it ON it.tagId = t.id WHERE it.imageId = ?`
      )
      .all(imageId) as Array<{ name: string }>
    return rows.map((r) => r.name)
  }
}

/* ---------------------------------- 设置 ---------------------------------- */

export const settingsRepo = {
  get<T = string>(key: string, def: T): T {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    if (!row) return def
    try {
      return JSON.parse(row.value) as T
    } catch {
      return row.value as unknown as T
    }
  },

  set(key: string, value: unknown): void {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, JSON.stringify(value))
  }
}
