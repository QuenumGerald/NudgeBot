import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: process.env.DATABASE_URL || path.join(__dirname, '../../../nudgebot.sqlite'),
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

    const defaultUser = await db.get('SELECT id FROM users WHERE email = ?', 'admin@example.com');
    if (!defaultUser) {
      await db.run(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        'admin@example.com',
        'password123'
      );
      const user = await db.get('SELECT id FROM users WHERE email = ?', 'admin@example.com');
      await db.run(
        'INSERT INTO settings (user_id, llm_provider, llm_model, llm_api_key) VALUES (?, ?, ?, ?)',
        user.id,
        'openrouter',
        'deepseek/deepseek-chat:free',
        ''
      );
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
