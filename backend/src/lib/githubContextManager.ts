/**
 * Gestionnaire de contexte utilisant GitHub comme backend persistant.
 * Optimisé pour Render avec déploiements éphémères.
 */

export const toWellFormedUnicode = (str: string): string => {
  if (typeof (str as any).toWellFormed === "function") {
    return (str as any).toWellFormed();
  }
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, (match, p1) => {
    return p1 ? p1 + "\uFFFD" : "\uFFFD";
  });
};

export interface ContextMessage {
  role: string;
  content: string;
  timestamp?: string;
  topic?: string;
}

export interface ConversationContext {
  messages?: ContextMessage[];
  decisions?: string[];
  pending_actions?: Array<{ description: string; priority?: string; timestamp?: string }>;
  [key: string]: unknown;
}

export interface CompressedContext {
  version: string;
  timestamp: string;
  summary: string;
  key_decisions: Array<{ text: string; timestamp: string }>;
  active_topics: string[];
  next_actions: Array<{ description: string; priority: string; timestamp: string }>;
  metadata: {
    original_size: number;
    compressed_size: number;
    compression_ratio: number;
  };
}

export interface CommitEntry {
  sha: string;
  message: string;
  date: string;
  author: string;
}

const DECISION_KEYWORDS = ["décidé", "choisi", "opté pour", "va utiliser"];
const ACTION_KEYWORDS = ["doit", "faire", "implémenter", "créer", "ajouter"];
const TOPIC_PATTERNS: Array<[string, string]> = [
  ["api", "api"],
  ["security", "security"],
  ["sécurité", "security"],
  ["render", "render"],
  ["github", "github"],
];

export class GitHubContextManager {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  // In-memory caches for low-latency operations
  private readonly contextCache = new Map<string, CompressedContext>();
  private readonly fileCache = new Map<string, string>();
  private readonly pendingWrites = new Map<
    string,
    { content: string; message: string; timeout: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly token: string,
    private readonly owner: string,
    public readonly repo: string
  ) {
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    this.headers = {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  // ── Compression ────────────────────────────────────────────────────────────

  private safeSlice(str: string, limit: number): string {
    const chars = Array.from(str);
    if (chars.length <= limit) return str;
    return chars.slice(0, limit).join("");
  }

  private compressContext(context: ConversationContext): CompressedContext {
    const originalSize = JSON.stringify(context).length;

    const compressed: CompressedContext = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(context),
      key_decisions: this.extractDecisions(context),
      active_topics: this.extractTopics(context),
      next_actions: this.extractActions(context),
      metadata: {
        original_size: originalSize,
        compressed_size: 0,
        compression_ratio: 0,
      },
    };

    const compressedSize = JSON.stringify(compressed).length;
    compressed.metadata.compressed_size = compressedSize;
    compressed.metadata.compression_ratio =
      originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 10000) / 100 : 0;

    return compressed;
  }

  private generateSummary(context: ConversationContext): string {
    const messages = context.messages ?? [];
    const last = messages.slice(-5);
    const topics = [...new Set(last.map((m) => m.topic).filter(Boolean))];
    return `Discussion sur: ${topics.length ? topics.join(", ") : "divers sujets"}`;
  }

  private extractDecisions(
    context: ConversationContext
  ): Array<{ text: string; timestamp: string }> {
    if (context.decisions) {
      return context.decisions.map((d) => ({
        text: this.safeSlice(d, 200),
        timestamp: new Date().toISOString(),
      }));
    }

    const now = new Date().toISOString();
    return (context.messages ?? [])
      .filter((m) => DECISION_KEYWORDS.some((kw) => m.content.toLowerCase().includes(kw)))
      .slice(0, 10)
      .map((m) => ({ text: this.safeSlice(m.content, 200), timestamp: m.timestamp ?? now }));
  }

  private extractTopics(context: ConversationContext): string[] {
    const topics = new Set<string>();
    const last20 = (context.messages ?? []).slice(-20);
    for (const msg of last20) {
      const lower = msg.content.toLowerCase();
      for (const [keyword, topic] of TOPIC_PATTERNS) {
        if (lower.includes(keyword)) topics.add(topic);
      }
    }
    return [...topics];
  }

  private extractActions(
    context: ConversationContext
  ): Array<{ description: string; priority: string; timestamp: string }> {
    if (context.pending_actions) return context.pending_actions.map((a) => ({
      description: a.description,
      priority: a.priority ?? "medium",
      timestamp: a.timestamp ?? new Date().toISOString(),
    }));

    const now = new Date().toISOString();
    return (context.messages ?? [])
      .slice(-10)
      .filter((m) => ACTION_KEYWORDS.some((kw) => m.content.toLowerCase().includes(kw)))
      .slice(0, 5)
      .map((m) => ({
        description: this.safeSlice(m.content, 150),
        priority: "medium",
        timestamp: m.timestamp ?? now,
      }));
  }

  // ── Repo bootstrap ─────────────────────────────────────────────────────────

  async ensureRepoExists(): Promise<boolean> {
    console.log(`[github-ctx] checking repository ${this.owner}/${this.repo}...`);
    const checkRes = await fetch(`${this.baseUrl}`, { headers: this.headers });
    if (checkRes.ok) {
      console.log(`[github-ctx] repository ${this.owner}/${this.repo} already exists`);
      return true;
    }
    if (checkRes.status !== 404) {
      console.error(`[github-ctx] unexpected status checking repo ${this.owner}/${this.repo}: ${checkRes.status}`);
      return false;
    }

    console.log(`[github-ctx] repository ${this.owner}/${this.repo} not found; creating it...`);
    const createRes = await fetch(`https://api.github.com/user/repos`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        name: this.repo,
        description: "NudgeBot conversation context persistence",
        private: true,
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error(`[github-ctx] failed to create repo ${this.owner}/${this.repo}: ${createRes.status} ${err}`);
      return false;
    }

    console.log(`[github-ctx] repo ${this.owner}/${this.repo} created; waiting for GitHub to initialise it...`);
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      console.log(`[github-ctx] verification attempt ${attempt}/10 for ${this.owner}/${this.repo}`);
      const verifyRes = await fetch(`${this.baseUrl}`, { headers: this.headers });
      if (verifyRes.ok) {
        console.log(`[github-ctx] repository ${this.owner}/${this.repo} is ready`);
        return true;
      }
      console.log(`[github-ctx] repository ${this.owner}/${this.repo} not ready yet: ${verifyRes.status}`);
    }

    console.error(`[github-ctx] repository ${this.owner}/${this.repo} was created but is not ready after 10 attempts`);
    return false;
  }

  // ── GitHub API helpers ──────────────────────────────────────────────────────

  private async getFileSha(filePath: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/contents/${filePath}`, {
        headers: this.headers,
      });
      if (res.ok) {
        const data = (await res.json()) as { sha: string };
        return data.sha;
      }
    } catch {
      // file doesn't exist yet
    }
    return null;
  }


  public async getFile(filePath: string): Promise<string | null> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }
    try {
      const res = await fetch(`${this.baseUrl}/contents/${filePath}`, {
        headers: this.headers,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content: string };
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      this.fileCache.set(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  public async rawPutFile(
    filePath: string,
    content: string,
    message: string
  ): Promise<boolean> {
    let sha = await this.getFileSha(filePath);
    const body: Record<string, any> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: "main",
    };
    if (sha) body.sha = sha;

    let res = await fetch(`${this.baseUrl}/contents/${filePath}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      console.warn(`[github-ctx] 409 conflict writing ${filePath}. Retrying with fresh SHA...`);
      const freshSha = await this.getFileSha(filePath);
      if (freshSha) {
        body.sha = freshSha;
      } else {
        delete body.sha;
      }
      res = await fetch(`${this.baseUrl}/contents/${filePath}`, {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(body),
      });
    }

    const ok = res.status === 200 || res.status === 201;
    if (ok) {
      console.log(`[github-ctx] successfully synced ${filePath} to GitHub`);
    } else {
      console.error(`[github-ctx] failed to sync ${filePath} to GitHub: ${res.status}`);
    }
    return ok;
  }

  public async putFile(
    filePath: string,
    content: string,
    message: string
  ): Promise<boolean> {
    // 1. Update the local file cache immediately
    this.fileCache.set(filePath, content);

    // 2. Debounce writing to GitHub (30 seconds)
    const existing = this.pendingWrites.get(filePath);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(async () => {
      this.pendingWrites.delete(filePath);
      await this.rawPutFile(filePath, content, message);
    }, 30000); // 30 seconds debounce

    this.pendingWrites.set(filePath, { content, message, timeout });
    console.log(`[github-ctx] scheduled save for ${filePath} in 30s`);
    return true;
  }

  public async flush(): Promise<void> {
    const pending = Array.from(this.pendingWrites.entries());
    if (pending.length === 0) return;

    console.log(`[github-ctx] flushing ${pending.length} pending file(s) to GitHub...`);
    for (const [filePath, item] of pending) {
      clearTimeout(item.timeout);
      this.pendingWrites.delete(filePath);
      try {
        await this.rawPutFile(filePath, item.content, item.message);
      } catch (err) {
        console.error(`[github-ctx] error flushing ${filePath} on exit:`, err);
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async saveUserContext(userId: string, context: ConversationContext): Promise<boolean> {
    try {
      const compressed = this.compressContext(context);
      this.contextCache.set(userId, compressed);
      const json = JSON.stringify(compressed, null, 2);
      const ok = await this.putFile(
        `users/${userId}/context.json`,
        json,
        `Update context for user ${userId}`
      );
      if (ok) {
        console.log(
          `[github-ctx] context saved in cache for ${userId} (compression: ${compressed.metadata.compression_ratio}%)`
        );
      }
      return ok;
    } catch (err) {
      console.error("[github-ctx] saveUserContext error:", err);
      return false;
    }
  }

  async loadUserContext(userId: string): Promise<CompressedContext | null> {
    // 1. Check in-memory cache first
    if (this.contextCache.has(userId)) {
      return this.contextCache.get(userId)!;
    }

    try {
      const res = await fetch(`${this.baseUrl}/contents/users/${userId}/context.json`, {
        headers: this.headers,
      });

      if (res.status === 404) {
        console.log(`[github-ctx] no existing context for ${userId}`);
        return null;
      }
      if (!res.ok) {
        console.error(`[github-ctx] load error: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as { content: string };
      const json = Buffer.from(data.content, "base64").toString("utf-8");
      const context = JSON.parse(json) as CompressedContext;

      // Clean loaded context to ensure all strings are well-formed Unicode
      if (context) {
        if (context.summary) context.summary = toWellFormedUnicode(context.summary);
        if (Array.isArray(context.key_decisions)) {
          context.key_decisions = context.key_decisions.map((d) => ({
            ...d,
            text: toWellFormedUnicode(d.text || ""),
          }));
        }
        if (Array.isArray(context.active_topics)) {
          context.active_topics = context.active_topics.map((t) => toWellFormedUnicode(t || ""));
        }
        if (Array.isArray(context.next_actions)) {
          context.next_actions = context.next_actions.map((a) => ({
            ...a,
            description: toWellFormedUnicode(a.description || ""),
          }));
        }
      }

      console.log(
        `[github-ctx] context loaded for ${userId} (${context.metadata.compressed_size} bytes)`
      );
      // Cache it
      this.contextCache.set(userId, context);
      return context;
    } catch (err) {
      console.error("[github-ctx] loadUserContext error:", err);
      return null;
    }
  }

  async saveUserSettings(userId: string, settings: Record<string, unknown>): Promise<boolean> {
    try {
      return await this.putFile(
        `users/${userId}/settings.json`,
        JSON.stringify(settings, null, 2),
        `Update settings for user ${userId}`
      );
    } catch (err) {
      console.error("[github-ctx] saveUserSettings error:", err);
      return false;
    }
  }

  async getUserHistory(userId: string, limit = 10): Promise<CommitEntry[]> {
    try {
      const url = new URL(`${this.baseUrl}/commits`);
      url.searchParams.set("path", `users/${userId}`);
      url.searchParams.set("per_page", String(limit));

      const res = await fetch(url.toString(), { headers: this.headers });
      if (!res.ok) return [];

      const commits = (await res.json()) as Array<{
        sha: string;
        commit: { message: string; author: { date: string; name: string } };
      }>;

      return commits.map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message,
        date: c.commit.author.date,
        author: c.commit.author.name,
      }));
    } catch (err) {
      console.error("[github-ctx] getUserHistory error:", err);
      return [];
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Resolves the authenticated GitHub user's login from the token.
 */
const resolveGitHubOwner = async (token: string): Promise<string | null> => {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { login: string };
    return data.login ?? null;
  } catch {
    return null;
  }
};

let memoryInstance: GitHubContextManager | null = null;
let workspaceInstance: GitHubContextManager | null = null;
let initPromise: Promise<void> | null = null;

const firstEnvValue = (names: string[]): { name: string; value: string } | null => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
};

const createManager = async (
  label: "memory" | "workspace",
  token: string,
  repoConfig: string
): Promise<GitHubContextManager | null> => {
  console.log(`[github-ctx] configuring ${label} repository from value: ${repoConfig}`);

  let owner: string;
  let repo: string;
  const parts = repoConfig.split("/").filter(Boolean);

  if (parts.length === 2) {
    [owner, repo] = parts;
  } else if (parts.length === 1) {
    const login = await resolveGitHubOwner(token);
    if (!login) {
      console.error(`[github-ctx] unable to resolve GitHub owner for ${label} repository`);
      return null;
    }
    owner = login;
    [repo] = parts;
  } else {
    console.error(`[github-ctx] invalid ${label} repository value: ${repoConfig}`);
    return null;
  }

  console.log(`[github-ctx] ${label} repository resolved to ${owner}/${repo}`);
  const manager = new GitHubContextManager(token, owner, repo);
  const ready = await manager.ensureRepoExists();
  if (!ready) {
    console.error(`[github-ctx] ${label} repository ${owner}/${repo} is unavailable`);
    return null;
  }
  console.log(`[github-ctx] ${label} repository ${owner}/${repo} is configured`);
  return manager;
};

const initManager = async (): Promise<void> => {
  console.log("[github-ctx] starting dual-repo GitHub context initialisation...");
  const tokenConfig = firstEnvValue(["GITHUB_TOKEN", "GITHUB_CONTEXT_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"]);

  if (!tokenConfig) {
    console.warn("[github-ctx] No token found. Dual-repo persistence disabled.");
    return;
  }
  console.log(`[github-ctx] using token from ${tokenConfig.name}`);

  const memoryRepoConfig = firstEnvValue(["GITHUB_MEMORY_REPO", "GITHUB_CONTEXT_REPO", "GITHUB_REPO"]);
  const workspaceRepoConfig = firstEnvValue(["GITHUB_WORKSPACE_REPO"]);
  const memoryRepo = memoryRepoConfig?.value ?? "nudgebot-memory";
  const workspaceRepo = workspaceRepoConfig?.value ?? "nudgebot-workspace";

  console.log(`[github-ctx] memory repo source: ${memoryRepoConfig?.name ?? "default"} (${memoryRepo})`);
  console.log(`[github-ctx] workspace repo source: ${workspaceRepoConfig?.name ?? "default"} (${workspaceRepo})`);

  memoryInstance = await createManager("memory", tokenConfig.value, memoryRepo);
  workspaceInstance = await createManager("workspace", tokenConfig.value, workspaceRepo);

  if (memoryInstance) console.log(`[github-ctx] Memory repo ready: ${memoryInstance.repo}`);
  if (workspaceInstance) console.log(`[github-ctx] Workspace repo ready: ${workspaceInstance.repo}`);
};

export const initGitHubContextManager = (): Promise<void> => {
  if (!initPromise) initPromise = initManager();
  return initPromise;
};

export const getGitHubMemoryManager = (): GitHubContextManager | null => memoryInstance;
export const getGitHubWorkspaceManager = (): GitHubContextManager | null => workspaceInstance;

// Compatibility aliases
export const getGitHubContextManager = (): GitHubContextManager | null => memoryInstance;

export const flushGitHubContextManagers = async () => {
  if (memoryInstance) {
    await memoryInstance.flush();
  }
  if (workspaceInstance) {
    await workspaceInstance.flush();
  }
};

export const resetManagerForTesting = () => {
  memoryInstance = null;
  workspaceInstance = null;
  initPromise = null;
};
