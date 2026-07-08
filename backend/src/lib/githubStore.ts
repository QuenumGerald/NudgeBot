/**
 * Store backed by Neon (PostgreSQL) with a fallback to GitHub/In-Memory JSON database.
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { initGitHubContextManager, getGitHubMemoryManager } from './githubContextManager.js';

const { Pool } = pg;

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface SettingsRecord {
  id: number;
  user_id: number;
  llm_provider: string | null;
  llm_model: string | null;
  llm_api_key: string | null;
  enabled_integrations: string;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  user_id: number;
  recipient_email: string;
  subject: string;
  body: string;
  send_at: string;
  sent_at: string | null;
  status: string;
  last_error: string | null;
  recurrence_interval_minutes: number | null;
  max_runs: number | null;
  run_count: number;
  last_sent_at: string | null;
  created_at: string;
}

interface StoreData {
  users: UserRecord[];
  settings: SettingsRecord[];
  notifications: NotificationRecord[];
  _nextIds: {
    users: number;
    settings: number;
    notifications: number;
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

class GitHubStore {
  private pool: pg.Pool | null = null;
  private usePostgres = false;
  private initialized = false;

  // In-memory data for GitHub/In-Memory fallback mode
  private data: StoreData = {
    users: [],
    settings: [],
    notifications: [],
    _nextIds: {
      users: 1,
      settings: 1,
      notifications: 1,
    },
  };
  private syncTimeout: NodeJS.Timeout | null = null;

  // ── Init ─────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;

    const connectionString = process.env.DATABASE_URL;
    if (connectionString && (connectionString.startsWith('postgres') || connectionString.includes('neon.tech'))) {
      console.log("[store] DATABASE_URL points to Postgres. Initializing NeonStore...");
      this.usePostgres = true;
      this.pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
      });

      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE NOT NULL,
            llm_provider VARCHAR(50),
            llm_model VARCHAR(100),
            llm_api_key VARCHAR(255),
            enabled_integrations TEXT DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            recipient_email VARCHAR(255) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            body TEXT NOT NULL,
            send_at TIMESTAMP WITH TIME ZONE NOT NULL,
            sent_at TIMESTAMP WITH TIME ZONE,
            status VARCHAR(50) DEFAULT 'pending',
            last_error TEXT,
            recurrence_interval_minutes INTEGER,
            max_runs INTEGER,
            run_count INTEGER DEFAULT 0,
            last_sent_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS chat_history (
            user_id INTEGER PRIMARY KEY,
            messages TEXT NOT NULL DEFAULT '[]',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS chat_conversations (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT 'New chat',
            messages TEXT NOT NULL DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Ensure admin user exists
        const res = await this.pool.query("SELECT * FROM users WHERE email = 'admin'");
        if (res.rowCount === 0) {
          await this.pool.query("INSERT INTO users (id, email, password_hash) VALUES (1, 'admin', '') ON CONFLICT DO NOTHING");
        }

        // Migrate existing data from GitHub if Postgres is empty
        await this.migrateGitHubDataToPostgres();

        console.log("[store] Neon Database initialized and tables verified");
        this.initialized = true;
        return;
      } catch (err) {
        console.error("[store] Neon Database initialization failed, falling back to GitHub store:", err);
        this.usePostgres = false;
      }
    }

    console.log("[store] No Postgres connection string. Initializing GitHub/In-Memory store...");
    await initGitHubContextManager();
    const mgr = getGitHubMemoryManager();
    if (!mgr) {
      console.warn("[store] No GitHub memory manager — running with empty in-memory store");
      this.ensureAdminUser();
      this.initialized = true;
      return;
    }

    // Load store from GitHub
    try {
      const ctx = await this.loadFile("store/db.json");
      if (ctx) {
        this.data = ctx as StoreData;
        const removedSensitiveData = this.removeSensitiveSettingsData();
        if (removedSensitiveData) {
          await this.saveToGitHub();
        }
        console.log(
          `[store] loaded from GitHub: ${this.data.users.length} users, ${this.data.settings.length} settings, ${this.data.notifications.length} notifications`
        );
      }
    } catch (err) {
      console.error("[store] failed to load from GitHub, starting fresh:", err);
    }

    this.ensureAdminUser();
    this.initialized = true;
  }

  private ensureAdminUser(): void {
    if (this.data.users.length === 0) {
      this.data.users.push({
        id: 1,
        email: "admin",
        password_hash: "",
        created_at: new Date().toISOString(),
      });
      this.data._nextIds.users = 2;
    }
  }

  private async migrateGitHubDataToPostgres(): Promise<void> {
    if (!this.pool) return;

    try {
      const settingsCountRes = await this.pool.query("SELECT COUNT(*) AS count FROM settings");
      if (!settingsCountRes || !settingsCountRes.rows || settingsCountRes.rows.length === 0) {
        return;
      }
      if (Number(settingsCountRes.rows[0].count) > 0) {
        return;
      }

      console.log("[store] Neon database settings table is empty. Checking for existing GitHub data to migrate...");
      await initGitHubContextManager();
      const mgr = getGitHubMemoryManager();
      if (!mgr) return;

      const ctx = await this.loadFile("store/db.json");
      if (!ctx) return;

      const githubData = ctx as StoreData;
      console.log(`[store] Found existing data on GitHub (${githubData.users.length} users, ${githubData.settings.length} settings, ${githubData.notifications.length} notifications). Migrating to Neon...`);

      // Migrate users
      for (const u of githubData.users) {
        await this.pool.query(
          "INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
          [u.id, u.email, u.password_hash, u.created_at || new Date().toISOString()]
        );
      }

      // Migrate settings
      for (const s of githubData.settings) {
        await this.pool.query(
          "INSERT INTO settings (id, user_id, llm_provider, llm_model, llm_api_key, enabled_integrations, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
          [s.id, s.user_id, s.llm_provider, s.llm_model, s.llm_api_key, s.enabled_integrations || '[]', s.created_at || new Date().toISOString()]
        );
      }

      // Migrate notifications
      for (const n of githubData.notifications) {
        await this.pool.query(
          `INSERT INTO notifications (id, user_id, recipient_email, subject, body, send_at, sent_at, status, last_error, recurrence_interval_minutes, max_runs, run_count, last_sent_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO NOTHING`,
          [
            n.id, n.user_id, n.recipient_email, n.subject, n.body, n.send_at, n.sent_at, n.status, n.last_error,
            n.recurrence_interval_minutes, n.max_runs, n.run_count || 0, n.last_sent_at, n.created_at || new Date().toISOString()
          ]
        );
      }

      console.log("[store] Neon Database migration from GitHub completed successfully!");
    } catch (err) {
      console.error("[store] Error during data migration to Neon Postgres:", err);
    }
  }

  private removeSensitiveSettingsData(): boolean {
    let changed = false;
    for (const settings of this.data.settings) {
      if (settings.llm_api_key !== null) {
        settings.llm_api_key = null;
        changed = true;
      }
    }
    return changed;
  }

  private getSanitizedDataForPersistence(): StoreData {
    return {
      ...this.data,
      settings: this.data.settings.map((settings) => ({
        ...settings,
        llm_api_key: null,
      })),
    };
  }

  // ── GitHub sync ──────────────────────────────────────────────────────────

  private scheduleSave(): void {
    if (this.syncTimeout) return;
    this.syncTimeout = setTimeout(async () => {
      this.syncTimeout = null;
      await this.saveToGitHub();
    }, 2000);
  }

  private async saveToGitHub(): Promise<void> {
    const mgr = getGitHubMemoryManager();
    if (!mgr) return;

    try {
      const json = JSON.stringify(this.getSanitizedDataForPersistence(), null, 2);
      const ok = await (mgr as any).putFile(
        "store/db.json",
        json,
        `Update store: ${this.data.users.length}u ${this.data.settings.length}s ${this.data.notifications.length}n`
      );
      if (ok) {
        console.log("[store] synced to GitHub");
      } else {
        console.error("[store] failed to sync to GitHub");
      }
    } catch (err) {
      console.error("[store] sync error:", err);
    }
  }

  private async loadFile(filePath: string): Promise<unknown | null> {
    const mgr = getGitHubMemoryManager();
    if (!mgr) return null;

    try {
      const baseUrl = (mgr as any).baseUrl as string;
      const headers = (mgr as any).headers as Record<string, string>;

      const res = await fetch(`${baseUrl}/contents/${filePath}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) return null;

      const data = (await res.json()) as { content: string };
      const json = Buffer.from(data.content, "base64").toString("utf-8");
      return JSON.parse(json);
    } catch {
      return null;
    }
  }



  // ── Users ────────────────────────────────────────────────────────────────

  async getUser(id: number): Promise<UserRecord | undefined> {
    if (this.usePostgres) {
      if (!this.pool) return undefined;
      const res = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
      if (res.rowCount === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        password_hash: row.password_hash,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      };
    }
    return this.data.users.find((u) => u.id === id);
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    if (this.usePostgres) {
      if (!this.pool) return undefined;
      const res = await this.pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (res.rowCount === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        password_hash: row.password_hash,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      };
    }
    return this.data.users.find((u) => u.email === email);
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(userId: number): Promise<SettingsRecord | undefined> {
    if (this.usePostgres) {
      if (!this.pool) return undefined;
      const res = await this.pool.query("SELECT * FROM settings WHERE user_id = $1", [userId]);
      if (res.rowCount === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        user_id: row.user_id,
        llm_provider: row.llm_provider,
        llm_model: row.llm_model,
        llm_api_key: row.llm_api_key,
        enabled_integrations: row.enabled_integrations || '[]',
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      };
    }
    return this.data.settings.find((s) => s.user_id === userId);
  }

  async upsertSettings(
    userId: number,
    patch: Partial<Pick<SettingsRecord, "llm_provider" | "llm_model" | "llm_api_key" | "enabled_integrations">>
  ): Promise<SettingsRecord> {
    if (this.usePostgres) {
      if (!this.pool) throw new Error("Database not initialized");

      const existing = await this.getSettings(userId);
      if (existing) {
        const updates: string[] = [];
        const values: any[] = [];
        let valIdx = 1;

        if (patch.llm_provider !== undefined) {
          updates.push(`llm_provider = $${valIdx++}`);
          values.push(patch.llm_provider);
        }
        if (patch.llm_model !== undefined) {
          updates.push(`llm_model = $${valIdx++}`);
          values.push(patch.llm_model);
        }
        if (patch.llm_api_key !== undefined) {
          updates.push(`llm_api_key = $${valIdx++}`);
          values.push(null);
        }
        if (patch.enabled_integrations !== undefined) {
          updates.push(`enabled_integrations = $${valIdx++}`);
          values.push(patch.enabled_integrations);
        }

        if (updates.length > 0) {
          values.push(userId);
          await this.pool.query(
            `UPDATE settings SET ${updates.join(', ')} WHERE user_id = $${valIdx}`,
            values
          );
        }
      } else {
        await this.pool.query(
          `INSERT INTO settings (user_id, llm_provider, llm_model, llm_api_key, enabled_integrations)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            patch.llm_provider ?? null,
            patch.llm_model ?? null,
            null,
            patch.enabled_integrations ?? '[]'
          ]
        );
      }

      const updated = await this.getSettings(userId);
      if (!updated) throw new Error("Upsert settings failed");
      return updated;
    }

    let record = this.data.settings.find((s) => s.user_id === userId);

    if (record) {
      if (patch.llm_provider !== undefined) record.llm_provider = patch.llm_provider;
      if (patch.llm_model !== undefined) record.llm_model = patch.llm_model;
      if (patch.llm_api_key !== undefined) record.llm_api_key = null;
      if (patch.enabled_integrations !== undefined) record.enabled_integrations = patch.enabled_integrations;
    } else {
      record = {
        id: this.data._nextIds.settings++,
        user_id: userId,
        llm_provider: patch.llm_provider ?? null,
        llm_model: patch.llm_model ?? null,
        llm_api_key: null,
        enabled_integrations: patch.enabled_integrations ?? "[]",
        created_at: new Date().toISOString(),
      };
      this.data.settings.push(record);
    }

    this.scheduleSave();
    return record;
  }

  // ── Notifications ────────────────────────────────────────────────────────

  async getNotification(id: number): Promise<NotificationRecord | undefined> {
    if (this.usePostgres) {
      if (!this.pool) return undefined;
      const res = await this.pool.query("SELECT * FROM notifications WHERE id = $1", [id]);
      if (res.rowCount === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        user_id: row.user_id,
        recipient_email: row.recipient_email,
        subject: row.subject,
        body: row.body,
        send_at: row.send_at ? new Date(row.send_at).toISOString() : '',
        sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        status: row.status,
        last_error: row.last_error,
        recurrence_interval_minutes: row.recurrence_interval_minutes,
        max_runs: row.max_runs,
        run_count: row.run_count || 0,
        last_sent_at: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      };
    }
    return this.data.notifications.find((n) => n.id === id);
  }

  async getNotificationsByUser(userId: number): Promise<NotificationRecord[]> {
    if (this.usePostgres) {
      if (!this.pool) return [];
      const res = await this.pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 ORDER BY send_at DESC",
        [userId]
      );
      return res.rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        recipient_email: row.recipient_email,
        subject: row.subject,
        body: row.body,
        send_at: row.send_at ? new Date(row.send_at).toISOString() : '',
        sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        status: row.status,
        last_error: row.last_error,
        recurrence_interval_minutes: row.recurrence_interval_minutes,
        max_runs: row.max_runs,
        run_count: row.run_count || 0,
        last_sent_at: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      }));
    }
    return this.data.notifications
      .filter((n) => n.user_id === userId)
      .sort((a, b) => new Date(b.send_at).getTime() - new Date(a.send_at).getTime());
  }

  async getPendingNotifications(): Promise<NotificationRecord[]> {
    if (this.usePostgres) {
      if (!this.pool) return [];
      const res = await this.pool.query(
        "SELECT * FROM notifications WHERE sent_at IS NULL AND status = 'pending'"
      );
      return res.rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        recipient_email: row.recipient_email,
        subject: row.subject,
        body: row.body,
        send_at: row.send_at ? new Date(row.send_at).toISOString() : '',
        sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        status: row.status,
        last_error: row.last_error,
        recurrence_interval_minutes: row.recurrence_interval_minutes,
        max_runs: row.max_runs,
        run_count: row.run_count || 0,
        last_sent_at: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      }));
    }
    return this.data.notifications.filter(
      (n) => n.sent_at === null && n.status === "pending"
    );
  }

  async createNotification(
    userId: number,
    data: Pick<NotificationRecord, "recipient_email" | "subject" | "body" | "send_at"> &
      Partial<Pick<NotificationRecord, "recurrence_interval_minutes" | "max_runs">>
  ): Promise<NotificationRecord> {
    if (this.usePostgres) {
      if (!this.pool) throw new Error("Database not initialized");

      const res = await this.pool.query(
        `INSERT INTO notifications (user_id, recipient_email, subject, body, send_at, recurrence_interval_minutes, max_runs, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
        [
          userId,
          data.recipient_email,
          data.subject,
          data.body,
          data.send_at,
          data.recurrence_interval_minutes ?? null,
          data.max_runs ?? null
        ]
      );

      const created = await this.getNotification(res.rows[0].id);
      if (!created) throw new Error("Create notification failed");
      return created;
    }

    const record: NotificationRecord = {
      id: this.data._nextIds.notifications++,
      user_id: userId,
      recipient_email: data.recipient_email,
      subject: data.subject,
      body: data.body,
      send_at: data.send_at,
      sent_at: null,
      status: "pending",
      last_error: null,
      recurrence_interval_minutes: data.recurrence_interval_minutes ?? null,
      max_runs: data.max_runs ?? null,
      run_count: 0,
      last_sent_at: null,
      created_at: new Date().toISOString(),
    };

    this.data.notifications.push(record);
    this.scheduleSave();
    return record;
  }

  async updateNotification(
    id: number,
    patch: Partial<NotificationRecord>
  ): Promise<void> {
    if (this.usePostgres) {
      if (!this.pool) return;

      const updates: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      for (const [key, val] of Object.entries(patch)) {
        if (key === 'id') continue;
        updates.push(`${key} = $${valIdx++}`);
        values.push(val);
      }

      if (updates.length > 0) {
        values.push(id);
        await this.pool.query(
          `UPDATE notifications SET ${updates.join(', ')} WHERE id = $${valIdx}`,
          values
        );
      }
      return;
    }

    const record = this.data.notifications.find((n) => n.id === id);
    if (!record) return;
    Object.assign(record, patch);
    this.scheduleSave();
  }

  private getConversationIndexPath(userId: number): string {
    return path.join(process.cwd(), 'workspace', `conversations_${userId}.json`);
  }

  private getConversationHistoryPath(userId: number, conversationId: string): string {
    const safeConversationId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(process.cwd(), 'workspace', `history_${userId}_${safeConversationId}.json`);
  }

  private getConversationTitle(messagesJson: string): string {
    try {
      const messages = JSON.parse(messagesJson) as Array<{ role?: string; content?: string }>;
      const firstUserMessage = messages.find((m) => m.role === 'user' && m.content?.trim());
      const title = firstUserMessage?.content?.trim() || 'New chat';
      return title.length > 60 ? `${title.slice(0, 57)}...` : title;
    } catch {
      return 'New chat';
    }
  }

  async listChatConversations(userId: number): Promise<Array<{ id: string; title: string; updated_at: string }>> {
    if (this.usePostgres && this.pool) {
      try {
        const res = await this.pool.query(
          "SELECT id, title, updated_at FROM chat_conversations WHERE user_id = $1 ORDER BY updated_at DESC",
          [userId]
        );
        return res.rows.map((row) => ({
          id: String(row.id),
          title: row.title || 'New chat',
          updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        }));
      } catch (err) {
        console.error("[store] Error listing chat conversations from Postgres:", err);
        return [];
      }
    }

    try {
      const content = await fs.readFile(this.getConversationIndexPath(userId), 'utf-8');
      const conversations = JSON.parse(content) as Array<{ id: string; title: string; updated_at: string }>;
      return conversations.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    } catch {
      return [];
    }
  }

  async createChatConversation(userId: number): Promise<{ id: string; title: string; updated_at: string }> {
    const conversation = { id: randomUUID(), title: 'New chat', updated_at: new Date().toISOString() };

    if (this.usePostgres && this.pool) {
      try {
        await this.pool.query(
          "INSERT INTO chat_conversations (id, user_id, title, messages, created_at, updated_at) VALUES ($1, $2, $3, '[]', NOW(), NOW())",
          [conversation.id, userId, conversation.title]
        );
      } catch (err) {
        console.error("[store] Error creating chat conversation in Postgres:", err);
      }
      return conversation;
    }

    const conversations = await this.listChatConversations(userId);
    const updated = [conversation, ...conversations];
    await fs.mkdir(path.dirname(this.getConversationIndexPath(userId)), { recursive: true });
    await fs.writeFile(this.getConversationIndexPath(userId), JSON.stringify(updated, null, 2), 'utf-8');
    await fs.writeFile(this.getConversationHistoryPath(userId, conversation.id), '[]', 'utf-8');
    return conversation;
  }

  async getChatConversationHistory(userId: number, conversationId: string): Promise<string | null> {
    if (this.usePostgres && this.pool) {
      try {
        const res = await this.pool.query(
          "SELECT messages FROM chat_conversations WHERE user_id = $1 AND id = $2",
          [userId, conversationId]
        );
        if (res.rowCount !== null && res.rowCount > 0) {
          return res.rows[0].messages;
        }
      } catch (err) {
        console.error("[store] Error getting chat conversation from Postgres:", err);
      }
      return null;
    }

    try {
      return await fs.readFile(this.getConversationHistoryPath(userId, conversationId), 'utf-8');
    } catch {
      return null;
    }
  }

  async saveChatConversationHistory(userId: number, conversationId: string, messagesJson: string): Promise<void> {
    const title = this.getConversationTitle(messagesJson);
    const updatedAt = new Date().toISOString();

    if (this.usePostgres && this.pool) {
      try {
        await this.pool.query(
          "INSERT INTO chat_conversations (id, user_id, title, messages, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, messages = EXCLUDED.messages, updated_at = EXCLUDED.updated_at",
          [conversationId, userId, title, messagesJson]
        );
      } catch (err) {
        console.error("[store] Error saving chat conversation to Postgres:", err);
      }
      return;
    }

    try {
      await fs.mkdir(path.dirname(this.getConversationIndexPath(userId)), { recursive: true });
      await fs.writeFile(this.getConversationHistoryPath(userId, conversationId), messagesJson, 'utf-8');
      const conversations = await this.listChatConversations(userId);
      const withoutCurrent = conversations.filter((c) => c.id !== conversationId);
      await fs.writeFile(
        this.getConversationIndexPath(userId),
        JSON.stringify([{ id: conversationId, title, updated_at: updatedAt }, ...withoutCurrent], null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[store] failed to save local conversation history:', err);
    }
  }

  async getChatHistory(userId: number): Promise<string | null> {
    if (this.usePostgres && this.pool) {
      try {
        const res = await this.pool.query("SELECT messages FROM chat_history WHERE user_id = $1", [userId]);
        if (res.rowCount !== null && res.rowCount > 0) {
          return res.rows[0].messages;
        }

        // If not found in Postgres, check local file system to migrate it!
        const localPath = path.join(process.cwd(), 'workspace', `history_${userId}.json`);
        try {
          const content = await fs.readFile(localPath, 'utf-8');
          if (content) {
            console.log(`[store] Found local history file for user ${userId}. Migrating to Postgres...`);
            await this.saveChatHistory(userId, content);
            return content;
          }
        } catch {
          // Ignore if local file doesn't exist
        }

        // Check GitHub if local doesn't exist either
        await initGitHubContextManager();
        const mgr = getGitHubMemoryManager();
        if (mgr) {
          const content = await (mgr as any).getFile(`users/${userId}/messages.json`);
          if (content) {
            console.log(`[store] Found GitHub history file for user ${userId}. Migrating to Postgres...`);
            await this.saveChatHistory(userId, content);
            return content;
          }
        }
      } catch (err) {
        console.error("[store] Error getting chat history from Postgres:", err);
      }
      return null;
    }

    // Fallback if not using Postgres: read local file
    const localPath = path.join(process.cwd(), 'workspace', `history_${userId}.json`);
    try {
      return await fs.readFile(localPath, 'utf-8');
    } catch {
      // Fallback to GitHub
      await initGitHubContextManager();
      const mgr = getGitHubMemoryManager();
      if (mgr) {
        return await (mgr as any).getFile(`users/${userId}/messages.json`);
      }
    }
    return null;
  }

  async saveChatHistory(userId: number, messagesJson: string): Promise<void> {
    if (this.usePostgres && this.pool) {
      try {
        await this.pool.query(
          "INSERT INTO chat_history (user_id, messages, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET messages = EXCLUDED.messages, updated_at = EXCLUDED.updated_at",
          [userId, messagesJson]
        );
      } catch (err) {
        console.error("[store] Error saving chat history to Postgres:", err);
      }
      return;
    }

    // Save to local file system
    const localPath = path.join(process.cwd(), 'workspace', `history_${userId}.json`);
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, messagesJson, 'utf-8');
    } catch (err) {
      console.error('[store] failed to save local history:', err);
    }

    // Save to GitHub
    await initGitHubContextManager();
    const mgr = getGitHubMemoryManager();
    if (mgr) {
      try {
        await (mgr as any).putFile(`users/${userId}/messages.json`, messagesJson);
      } catch (err) {
        console.error("[store] failed to save history to GitHub:", err);
      }
    }
  }

  async checkAndPruneDatabase(): Promise<void> {
    if (process.env.DISABLE_DB_PRUNING === 'true') {
      return;
    }
    if (!this.usePostgres || !this.pool) return;

    try {
      const res = await this.pool.query("SELECT pg_database_size(current_database()) AS size_bytes");
      if (res.rowCount !== null && res.rowCount > 0) {
        const sizeBytes = Number(res.rows[0].size_bytes);
        const limitBytes = 450 * 1024 * 1024; // 450 MB (90% of 500MB)
        
        // Log size checks occasionally
        if (Math.random() < 0.1) {
          console.log(`[store] Neon Database size check: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB / 500 MB`);
        }

        if (sizeBytes > limitBytes) {
          console.warn(`[store] Neon Database size (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) is close to 500MB limit. Pruning old notifications and chat histories...`);
          const deleteRes = await this.pool.query(
            "DELETE FROM notifications WHERE sent_at IS NOT NULL OR status IN ('sent', 'failed', 'cancelled')"
          );
          const deleteChatRes = await this.pool.query(
            "DELETE FROM chat_history"
          );
          console.log(`[store] Pruned ${deleteRes.rowCount} historical notifications and cleared ${deleteChatRes.rowCount || 0} chat histories to free up database space.`);
        }
      }
    } catch (err) {
      console.error("[store] Failed to check database size or prune notifications:", err);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this.usePostgres) {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
        this.initialized = false;
        console.log("[store] Neon Database connection pool closed");
      }
      return;
    }

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    await this.saveToGitHub();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let store: GitHubStore | null = null;

export async function getStore(): Promise<GitHubStore> {
  if (!store) {
    store = new GitHubStore();
    await store.init();
  }
  return store;
}

export function getStoreSync(): GitHubStore | null {
  return store;
}
export function resetStoreForTesting(): void {
  store = null;
}
