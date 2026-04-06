import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Pool } from "pg";
import { config } from "./config";

const useSqlite = process.env.USE_SQLITE === "true";

// Sensitive keys that should be encrypted in the database
const SENSITIVE_KEYS = [
  "llm_api_key",
  "github_token",
  "jira_api_token",
  "google_client_secret",
  "google_refresh_token",
];

// Get stable encryption key from env or derive from APP_SECRET
function getEncryptionKey(): Buffer {
  if (process.env.ENCRYPTION_KEY) {
    // Expect a 32-byte hex string or derive from it
    const key = process.env.ENCRYPTION_KEY;
    if (key.length >= 64) {
      return Buffer.from(key.slice(0, 64), "hex");
    }
    // Hash it to get a stable 32-byte key
    return crypto.createHash("sha256").update(key).digest();
  }
  // Fallback: derive from APP_SECRET
  const secret = process.env.APP_SECRET || "default-insecure-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

// Encrypt sensitive value
function encryptValue(plaintext: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:encrypted (all hex)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  } catch (error) {
    console.error("[Crypto] Encryption failed:", error);
    throw error;
  }
}

// Decrypt sensitive value
function decryptValue(ciphertext: string): string {
  try {
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  } catch {
    // If decryption fails, return empty (corrupted or wrong key)
    return "";
  }
}

let pool: Pool | null = null;
type BetterSqlite3Type = typeof import("better-sqlite3");
type BetterSqlite3Db = import("better-sqlite3").Database;

let BetterSqlite3: BetterSqlite3Type | null = null;
let sqliteDb: BetterSqlite3Db | null = null;
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

function getSqliteModule(): BetterSqlite3Type {
  if (BetterSqlite3) return BetterSqlite3;
  try {
    // Lazy-load native module to avoid crashing routes that don't need sqlite.
    BetterSqlite3 = require("better-sqlite3") as BetterSqlite3Type;
    return BetterSqlite3;
  } catch (error: any) {
    throw new Error(
      `Failed to load better-sqlite3 (${error?.message || "unknown"}). ` +
      `Run "npm rebuild better-sqlite3" with the same Node version as "npm run dev".`
    );
  }
}

function getSqliteDb(): BetterSqlite3Db {
  if (sqliteDb) return sqliteDb;

  fs.mkdirSync(config.dataDir, { recursive: true });
  const sqlitePath = path.join(config.dataDir, "nudgebot.sqlite");
  const Database = getSqliteModule();
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
  const value = result.rows[0]?.value ?? null;
  if (!value) return null;
  return SENSITIVE_KEYS.includes(key) ? decryptValue(value) : value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    // Encrypt sensitive values before storing
    const isSensitive = SENSITIVE_KEYS.includes(key);
    const storedValue = isSensitive ? encryptValue(value) : value;

    if (useSqlite) {
      await query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, storedValue]
      );
    } else {
      await query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, storedValue]
      );
    }
    console.log(`[DB] Saved setting: ${key} (encrypted: ${isSensitive})`);
  } catch (error) {
    console.error(`[DB] Failed to save setting ${key}:`, error);
    throw error;
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  const result = await query("SELECT key, value FROM settings", []);
  return Object.fromEntries(
    result.rows.map((r: any) => [
      r.key,
      SENSITIVE_KEYS.includes(r.key) ? decryptValue(r.value) : r.value,
    ])
  );
}
