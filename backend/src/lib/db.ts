import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../../nudgebot.sqlite');

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await initializeDb(dbInstance);
  return dbInstance;
}

async function initializeDb(db: Database) {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        llm_provider TEXT,
        llm_model TEXT,
        llm_api_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        send_at DATETIME NOT NULL,
        sent_at DATETIME,
        status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        recurrence_interval_minutes INTEGER,
        max_runs INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        last_sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await addColumnIfMissing(db, 'scheduled_notifications', 'recurrence_interval_minutes', 'INTEGER');
    await addColumnIfMissing(db, 'scheduled_notifications', 'max_runs', 'INTEGER');
    await addColumnIfMissing(db, 'scheduled_notifications', 'run_count', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'scheduled_notifications', 'last_sent_at', 'DATETIME');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string) {
  const columns = await db.all<{ name: string }[]>(`PRAGMA table_info(${table})`);
  const exists = columns.some((col: { name: string }) => col.name === column);
  if (!exists) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
