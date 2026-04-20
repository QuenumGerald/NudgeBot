/**
 * In-memory store backed by GitHub JSON files.
 * Loads once at startup, writes back on mutations.
 * Replaces SQLite entirely — zero native dependencies.
 */

import { initGitHubContextManager, getGitHubMemoryManager } from "./githubContextManager.js";

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
  _nextIds: { users: number; settings: number; notifications: number };
}

// ── Store ────────────────────────────────────────────────────────────────────

class GitHubStore {
  private data: StoreData = {
    users: [],
    settings: [],
    notifications: [],
    _nextIds: { users: 1, settings: 1, notifications: 1 },
  };
  private initialized = false;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Init ─────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;

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

  // ── GitHub sync ──────────────────────────────────────────────────────────

  private scheduleSave(): void {
    // Debounce: save at most once per 2 seconds
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
      // Use the internal putFile via saveUserSettings (reuse existing API)
      const json = JSON.stringify(this.data, null, 2);
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

  /** Force an immediate save (e.g. on SIGTERM). */
  async flush(): Promise<void> {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    await this.saveToGitHub();
  }

  // ── Users ────────────────────────────────────────────────────────────────

  getUser(id: number): UserRecord | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.data.users.find((u) => u.email === email);
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  getSettings(userId: number): SettingsRecord | undefined {
    return this.data.settings.find((s) => s.user_id === userId);
  }

  async upsertSettings(
    userId: number,
    patch: Partial<Pick<SettingsRecord, "llm_provider" | "llm_model" | "llm_api_key" | "enabled_integrations">>
  ): Promise<SettingsRecord> {
    let record = this.data.settings.find((s) => s.user_id === userId);

    if (record) {
      if (patch.llm_provider !== undefined) record.llm_provider = patch.llm_provider;
      if (patch.llm_model !== undefined) record.llm_model = patch.llm_model;
      if (patch.llm_api_key !== undefined) record.llm_api_key = patch.llm_api_key;
      if (patch.enabled_integrations !== undefined) record.enabled_integrations = patch.enabled_integrations;
    } else {
      record = {
        id: this.data._nextIds.settings++,
        user_id: userId,
        llm_provider: patch.llm_provider ?? null,
        llm_model: patch.llm_model ?? null,
        llm_api_key: patch.llm_api_key ?? null,
        enabled_integrations: patch.enabled_integrations ?? "[]",
        created_at: new Date().toISOString(),
      };
      this.data.settings.push(record);
    }

    this.scheduleSave();
    return record;
  }

  // ── Notifications ────────────────────────────────────────────────────────

  getNotification(id: number): NotificationRecord | undefined {
    return this.data.notifications.find((n) => n.id === id);
  }

  getNotificationsByUser(userId: number): NotificationRecord[] {
    return this.data.notifications
      .filter((n) => n.user_id === userId)
      .sort((a, b) => new Date(b.send_at).getTime() - new Date(a.send_at).getTime());
  }

  getPendingNotifications(): NotificationRecord[] {
    return this.data.notifications.filter(
      (n) => n.sent_at === null && n.status === "pending"
    );
  }

  async createNotification(
    userId: number,
    data: Pick<NotificationRecord, "recipient_email" | "subject" | "body" | "send_at"> &
      Partial<Pick<NotificationRecord, "recurrence_interval_minutes" | "max_runs">>
  ): Promise<NotificationRecord> {
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
    const record = this.data.notifications.find((n) => n.id === id);
    if (!record) return;
    Object.assign(record, patch);
    this.scheduleSave();
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
