/**
 * Gestionnaire de sessions pour Render (déploiements éphémères).
 * Persiste le contexte de conversation sur GitHub entre les redémarrages.
 */

import { getGitHubContextManager, initGitHubContextManager, CompressedContext, ConversationContext } from "./githubContextManager";
import { scheduleRecurring } from "./blazerJobManager";

interface SessionData {
  context: ConversationContext & Partial<CompressedContext>;
  loadedAt: string;
  messageCount: number;
  lastSave: string | null;
}

const AUTO_SAVE_INTERVAL_MS = 60 * 60 * 1000; // 1 heure via BlazerJob
const MIN_SAVE_INTERVAL_MS = 60 * 1000;       // 1 min minimum entre sauvegardes
const MAX_MESSAGES_STORED = 50;

const TOPIC_PATTERNS: Array<[string[], string]> = [
  [["api", "endpoint", "rest", "graphql"], "api"],
  [["database", "db", "postgres", "mongodb"], "database"],
  [["auth", "security", "jwt", "oauth"], "security"],
  [["deploy", "render", "netlify", "aws"], "deployment"],
];

class RenderSessionManager {
  private sessions = new Map<string, SessionData>();
  private isShuttingDown = false;

  constructor() {
    this.startAutoSave();
    this.registerShutdownHandlers();
    console.log("[session] RenderSessionManager initialised");
  }

  // ── Session init ────────────────────────────────────────────────────────────

  private emptyContext(): ConversationContext {
    return {
      version: "1.0",
      timestamp: new Date().toISOString(),
      summary: "Nouvelle session",
      key_decisions: [],
      active_topics: [],
      next_actions: [],
      messages: [],
      metadata: {
        original_size: 0,
        compressed_size: 0,
        compression_ratio: 0,
        session_start: new Date().toISOString(),
      },
    };
  }

  async loadUserSession(userId: string): Promise<SessionData> {
    if (this.sessions.has(userId)) return this.sessions.get(userId)!;

    const ghCtx = await initGitHubContextManager();
    let context: ConversationContext = this.emptyContext();

    if (ghCtx) {
      const saved = await ghCtx.loadUserContext(userId);
      if (saved) {
        context = { ...saved, messages: (saved as any).messages ?? [] };
        console.log(`[session] loaded context for ${userId}: ${saved.summary}`);
      } else {
        console.log(`[session] no prior context for ${userId}, starting fresh`);
      }
    }

    const session: SessionData = {
      context,
      loadedAt: new Date().toISOString(),
      messageCount: (context.messages ?? []).length,
      lastSave: null,
    };

    this.sessions.set(userId, session);
    return session;
  }

  // ── Mutation helpers ────────────────────────────────────────────────────────

  addMessage(
    userId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      message_id: `msg_${session.messageCount}`,
      ...metadata,
    };

    session.context.messages = session.context.messages ?? [];
    session.context.messages.push(message);
    session.messageCount += 1;

    if (session.messageCount % 10 === 0) {
      this.updateSummary(userId);
    }
  }

  private updateSummary(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    const messages = (session.context.messages ?? []).slice(-10);
    const topics = new Set<string>();

    for (const msg of messages) {
      const lower = msg.content.toLowerCase();
      for (const [keywords, topic] of TOPIC_PATTERNS) {
        if (keywords.some((kw) => lower.includes(kw))) topics.add(topic);
      }
    }

    session.context.summary =
      topics.size > 0
        ? `Discussion sur: ${[...topics].sort().join(", ")}`
        : `Session avec ${session.messageCount} messages`;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  async saveUserSession(userId: string, force = false): Promise<boolean> {
    const ghCtx = getGitHubContextManager();
    if (!ghCtx) return false;

    const session = this.sessions.get(userId);
    if (!session) return false;

    if (!force && session.lastSave) {
      const elapsed = Date.now() - new Date(session.lastSave).getTime();
      if (elapsed < MIN_SAVE_INTERVAL_MS) return false;
    }

    // Trim messages to avoid bloat
    const contextToSave = { ...session.context };
    const msgs = contextToSave.messages ?? [];
    if (msgs.length > MAX_MESSAGES_STORED) {
      contextToSave.messages = msgs.slice(-MAX_MESSAGES_STORED);
    }

    const ok = await ghCtx.saveUserContext(userId, contextToSave);
    if (ok) session.lastSave = new Date().toISOString();
    return ok;
  }

  // ── Context summary for LLM injection ──────────────────────────────────────

  getContextSummaryForPrompt(userId: string): string | null {
    const session = this.sessions.get(userId);
    if (!session) return null;

    const ctx = session.context;
    const parts: string[] = [];

    if (ctx.summary && ctx.summary !== "Nouvelle session") {
      parts.push(`Résumé: ${ctx.summary}`);
    }

    const decisions = (ctx.key_decisions ?? []) as Array<{ text: string }>;
    if (decisions.length > 0) {
      parts.push(
        `Décisions précédentes: ${decisions
          .slice(-3)
          .map((d) => d.text)
          .join("; ")}`
      );
    }

    const actions = (ctx.next_actions ?? []) as Array<{ description: string }>;
    if (actions.length > 0) {
      parts.push(
        `Actions en cours: ${actions
          .slice(-3)
          .map((a) => a.description)
          .join("; ")}`
      );
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  clearSection(userId: string, section: "decisions" | "actions" | "topics" | "messages"): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    const map: Record<string, string> = {
      decisions: "key_decisions",
      actions: "next_actions",
      topics: "active_topics",
      messages: "messages",
    };
    (session.context as any)[map[section]] = [];
    if (section === "decisions" || section === "actions") {
      session.context.summary = "Session en cours";
    }
  }

  clearAll(userId: string): void {
    this.sessions.delete(userId);
  }

  getSessionStats(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) return null;

    const loadedAt = new Date(session.loadedAt);
    const durationMs = Date.now() - loadedAt.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    return {
      summary: session.context.summary ?? "—",
      messageCount: session.messageCount,
      decisionsCount: (session.context.key_decisions ?? []).length,
      actionsCount: (session.context.next_actions ?? []).length,
      lastSave: session.lastSave,
      sessionDuration: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
    };
  }

  // ── Auto-save & shutdown ────────────────────────────────────────────────────

  private startAutoSave(): void {
    if (!process.env.GITHUB_CONTEXT_TOKEN) return;

    scheduleRecurring("nudgebot_context_autosave", async () => {
      if (this.isShuttingDown) return;
      console.log("[session] auto-save triggered by BlazerJob");
      for (const userId of this.sessions.keys()) {
        await this.saveUserSession(userId).catch(console.error);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    console.log(`[session] auto-save scheduled every ${AUTO_SAVE_INTERVAL_MS / 60000}min via BlazerJob`);
  }

  private registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      console.log(`[session] ${signal} received — saving all sessions before exit`);

      for (const userId of this.sessions.keys()) {
        await this.saveUserSession(userId, true).catch(console.error);
      }

      console.log("[session] graceful shutdown complete");
      process.exit(0);
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let sessionManagerInstance: RenderSessionManager | null = null;

export const getSessionManager = (): RenderSessionManager => {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new RenderSessionManager();
  }
  return sessionManagerInstance;
};
