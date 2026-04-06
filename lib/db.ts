import fs from "fs";
import path from "path";
import { Pool } from "pg";
import Database from "better-sqlite3";
import { config } from "./config";

const useSqlite = process.env.USE_SQLITE === "true";

let pool: Pool | null = null;
let sqliteDb: Database.Database | null = null;
let isInitialized = false;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    pool = new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  return pool;
}

function getSqliteDb(): Database.Database {
  if (sqliteDb) return sqliteDb;

  fs.mkdirSync(config.dataDir, { recursive: true });
  const sqlitePath = path.join(config.dataDir, "nudgebot.sqlite");
  sqliteDb = new Database(sqlitePath);
  sqliteDb.pragma("journal_mode = WAL");
  return sqliteDb;
}

export async function initDb(): Promise<void> {
  if (isInitialized) return;

  if (useSqlite) {
    const db = getSqliteDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        importance INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        due_at DATETIME NOT NULL,
        done BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC, created_at DESC);
    `);
    isInitialized = true;
    return;
  }

  const db = getPool();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        importance INTEGER DEFAULT 3,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        due_at TIMESTAMPTZ NOT NULL,
        done BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC, created_at DESC);
    `);
    isInitialized = true;
  } catch (error) {
    console.error("Failed to initialize database schemas:", error);
    throw error;
  }
}

export async function query(text: string, params: any[] = []) {
  await initDb();

  if (useSqlite) {
    const db = getSqliteDb();
    let sqliteQuery = text.replace(/\$(\d+)/g, '?');
    sqliteQuery = sqliteQuery.replace(/ILIKE/gi, 'LIKE');

    const stmt = db.prepare(sqliteQuery);
    if (stmt.reader) {
      const rows = stmt.all(params);
      return { rows };
    }
    const info = stmt.run(params);
    return {
      rows: [],
      rowCount: info.changes,
      lastInsertRowid: info.lastInsertRowid,
    };
  }

  const db = getPool();
  return db.query(text, params);
}

export async function getSetting(key: string): Promise<string | null> {
  const result = await query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (useSqlite) {
    await query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    );
  } else {
    await query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [key, value]
    );
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  const result = await query("SELECT key, value FROM settings", []);
  return Object.fromEntries(result.rows.map((r: any) => [r.key, r.value]));
}
