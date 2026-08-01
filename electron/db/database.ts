import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let db: Database.Database | null = null

/** 获取数据库文件路径（放在用户数据目录，避免打包后只读问题） */
export function getDbPath(): string {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'pixmind.db')
}

/** 缩略图存储目录 */
export function getThumbDir(): string {
  const dir = path.join(app.getPath('userData'), 'thumbnails')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 初始化数据库并创建表结构 */
export function initDatabase(): Database.Database {
  if (db) return db

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS dirs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT NOT NULL UNIQUE,
      enabled   INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS images (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT NOT NULL UNIQUE,
      filename  TEXT NOT NULL,
      dirId     INTEGER NOT NULL,
      width     INTEGER NOT NULL DEFAULT 0,
      height    INTEGER NOT NULL DEFAULT 0,
      size      INTEGER NOT NULL DEFAULT 0,
      format    TEXT NOT NULL DEFAULT '',
      mtime     INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      favorite  INTEGER NOT NULL DEFAULT 0,
      embedded  INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (dirId) REFERENCES dirs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_images_dir      ON images(dirId);
    CREATE INDEX IF NOT EXISTS idx_images_embedded ON images(embedded);
    CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(favorite);
    CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);

    -- embedding 单独存表，二进制存储 Float32Array
    CREATE TABLE IF NOT EXISTS embeddings (
      imageId INTEGER PRIMARY KEY,
      dim     INTEGER NOT NULL,
      vector  BLOB NOT NULL,
      FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#409eff'
    );

    CREATE TABLE IF NOT EXISTS image_tags (
      imageId INTEGER NOT NULL,
      tagId   INTEGER NOT NULL,
      PRIMARY KEY (imageId, tagId),
      FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY (tagId)   REFERENCES tags(id)   ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return db
}

/** 获取已初始化的数据库实例 */
export function getDb(): Database.Database {
  if (!db) return initDatabase()
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
