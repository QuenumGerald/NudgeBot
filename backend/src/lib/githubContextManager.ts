/**
 * Gestionnaire de contexte utilisant GitHub comme backend persistant.
 * Optimisé pour Render avec déploiements éphémères.
 */

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
        text: d.slice(0, 200),
        timestamp: new Date().toISOString(),
      }));
    }

    const now = new Date().toISOString();
    return (context.messages ?? [])
      .filter((m) => DECISION_KEYWORDS.some((kw) => m.content.toLowerCase().includes(kw)))
      .slice(0, 10)
      .map((m) => ({ text: m.content.slice(0, 200), timestamp: m.timestamp ?? now }));
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
        description: m.content.slice(0, 150),
        priority: "medium",
        timestamp: m.timestamp ?? now,
      }));
  }

  // ── Repo bootstrap ─────────────────────────────────────────────────────────

  async ensureRepoExists(): Promise<boolean> {
    // Check if repo already exists
    const checkRes = await fetch(`${this.baseUrl}`, { headers: this.headers });
    if (checkRes.ok) return true;
    if (checkRes.status !== 404) {
      console.error(`[github-ctx] unexpected status checking repo: ${checkRes.status}`);
      return false;
    }

    // Create the repo (private, auto-initialised with a README so it has a main branch)
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

    if (createRes.ok) {
      console.log(`[github-ctx] repo ${this.owner}/${this.repo} created`);
      // Give GitHub a moment to initialise the default branch
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    }

    const err = await createRes.text();
    console.error(`[github-ctx] failed to create repo: ${createRes.status} ${err}`);
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

  public async putFile(
    filePath: string,
    content: string,
    message: string
  ): Promise<boolean> {
    const sha = await this.getFileSha(filePath);
    const body: Record<string, string> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: "main",
    };
    if (sha) body.sha = sha;

    const res = await fetch(`${this.baseUrl}/contents/${filePath}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    return res.status === 200 || res.status === 201;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async saveUserContext(userId: string, context: ConversationContext): Promise<boolean> {
    try {
      const compressed = this.compressContext(context);
      const json = JSON.stringify(compressed, null, 2);
      const ok = await this.putFile(
        `users/${userId}/context.json`,
        json,
        `Update context for user ${userId}`
      );
      if (ok) {
        console.log(
          `[github-ctx] context saved for ${userId} (compression: ${compressed.metadata.compression_ratio}%)`
        );
      } else {
        console.error(`[github-ctx] failed to save context for ${userId}`);
      }
      return ok;
    } catch (err) {
      console.error("[github-ctx] saveUserContext error:", err);
      return false;
    }
  }

  async loadUserContext(userId: string): Promise<CompressedContext | null> {
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
      console.log(
        `[github-ctx] context loaded for ${userId} (${context.metadata.compressed_size} bytes)`
      );
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

const createManager = async (token: string, repoConfig?: string, defaultName?: string): Promise<GitHubContextManager | null> => {
  let owner: string;
  let repo: string;

  if (repoConfig) {
    const parts = repoConfig.split("/");
    if (parts.length !== 2) return null;
    [owner, repo] = parts;
  } else {
    const login = await resolveGitHubOwner(token);
    if (!login) return null;
    owner = login;
    repo = defaultName || "nudgebot-data";
  }

  const manager = new GitHubContextManager(token, owner, repo);
  await manager.ensureRepoExists();
  return manager;
};

const initManager = async (): Promise<void> => {
  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_CONTEXT_TOKEN || "").trim();

  if (!token) {
    console.warn("[github-ctx] No token found. Dual-repo persistence disabled.");
    return;
  }

  memoryInstance = await createManager(token, process.env.GITHUB_MEMORY_REPO || process.env.GITHUB_REPO, "nudgebot-memory");
  workspaceInstance = await createManager(token, process.env.GITHUB_WORKSPACE_REPO, "nudgebot-workspace");

  if (memoryInstance) console.log(`[github-ctx] Memory repo: ${memoryInstance.repo}`);
  if (workspaceInstance) console.log(`[github-ctx] Workspace repo: ${workspaceInstance.repo}`);
};

export const initGitHubContextManager = (): Promise<void> => {
  if (!initPromise) initPromise = initManager();
  return initPromise;
};

export const getGitHubMemoryManager = (): GitHubContextManager | null => memoryInstance;
export const getGitHubWorkspaceManager = (): GitHubContextManager | null => workspaceInstance;

// Compatibility aliases
export const getGitHubContextManager = (): GitHubContextManager | null => memoryInstance;

export const resetManagerForTesting = () => {
  memoryInstance = null;
  workspaceInstance = null;
  initPromise = null;
};
