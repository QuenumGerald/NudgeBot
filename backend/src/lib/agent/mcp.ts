import { MCPClient } from "@mastra/mcp";

export const AVAILABLE_INTEGRATIONS = [
  "fetch",
  "github",
  "google_calendar",
  "jira",
  "confluence",
  "render",
  "netlify",
] as const;

export type IntegrationId = (typeof AVAILABLE_INTEGRATIONS)[number];

type McpRuntime = {
  client: MCPClient;
  tools: Record<string, any>;
};

// Cache keyed by "<userId>:<sorted-integrations>"
const mcpCache = new Map<string, Promise<McpRuntime | null>>();

const toEnv = (value?: string) => (value ?? "").trim();

const parseGoogleCredentials = () => {
  const raw = toEnv(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    console.error("[mcp] Invalid GOOGLE_SERVICE_ACCOUNT_JSON, ignoring.", error);
    return undefined;
  }
};

const ALL_SERVERS = () => {
  return {
    fetch: {
      command: "npx",
      args: ["-y", "@mokei/mcp-fetch"],
    },
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        ...(process.env as Record<string, string>),
        GITHUB_PERSONAL_ACCESS_TOKEN: toEnv(process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_CONTEXT_TOKEN),
      },
    },
    google_calendar: {
      command: "npx",
      args: ["-y", "mcp-google-calendar"],
      env: {
        ...(process.env as Record<string, string>),
        GOOGLE_CLIENT_ID: toEnv(process.env.GOOGLE_CLIENT_ID),
        GOOGLE_CLIENT_SECRET: toEnv(process.env.GOOGLE_CLIENT_SECRET),
        GOOGLE_REFRESH_TOKEN: toEnv(process.env.GOOGLE_REFRESH_TOKEN),
        GOOGLE_SERVICE_ACCOUNT_JSON: toEnv(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      },
    },
    jira: {
      command: "npx",
      args: ["-y", "@devpuccino/mcp-jira"],
      env: {
        ...(process.env as Record<string, string>),
        JIRA_API_TOKEN: toEnv(process.env.JIRA_API_TOKEN),
        JIRA_EMAIL: toEnv(process.env.JIRA_EMAIL),
        JIRA_URL: toEnv(process.env.JIRA_URL),
      },
    },
    confluence: {
      command: "npx",
      args: ["-y", "@devpuccino/mcp-confluence"],
      env: {
        ...(process.env as Record<string, string>),
        CONFLUENCE_API_TOKEN: toEnv(process.env.CONFLUENCE_API_TOKEN || process.env.JIRA_API_TOKEN),
        CONFLUENCE_EMAIL: toEnv(process.env.CONFLUENCE_EMAIL || process.env.JIRA_EMAIL),
        CONFLUENCE_DOMAIN: toEnv(process.env.CONFLUENCE_URL),
      },
    },
    render: {
      command: "npx",
      args: ["-y", "mcp-render"],
      env: {
        ...(process.env as Record<string, string>),
        RENDER_API_KEY: toEnv(process.env.RENDER_API_KEY),
      },
    },
    netlify: {
      command: "npx",
      args: ["-y", "@netlify/mcp"],
      env: {
        ...(process.env as Record<string, string>),
        NETLIFY_AUTH_TOKEN: toEnv(process.env.NETLIFY_AUTH_TOKEN),
      },
    },
  };
};

const initializeMCP = async (enabledIntegrations: string[], cacheKey: string): Promise<McpRuntime | null> => {
  if (enabledIntegrations.length === 0) return null;

  const allServers = ALL_SERVERS();
  const servers = Object.fromEntries(
    enabledIntegrations
      .filter((id) => id in allServers)
      .map((id) => [id, allServers[id as IntegrationId]])
  );

  if (Object.keys(servers).length === 0) return null;

  const client = new MCPClient({ id: cacheKey, servers });

  try {
    const tools = await client.listTools();
    console.log(`[mcp] loaded ${Object.keys(tools).length} tool(s) for integrations: ${enabledIntegrations.join(", ")}`);
    return { client, tools };
  } catch (error) {
    console.error("[mcp] MCP initialization failed, continuing without MCP tools.", error);
    await client.disconnect().catch(() => undefined);
    return null;
  }
};

export const setupMCP = async (
  enabledIntegrations: string[],
  userId: string
): Promise<Record<string, any>> => {
  if (enabledIntegrations.length === 0) return {};

  const cacheKey = `${userId}:${[...enabledIntegrations].sort().join(",")}`;

  if (!mcpCache.has(cacheKey)) {
    mcpCache.set(cacheKey, initializeMCP(enabledIntegrations, cacheKey));
  }

  const runtime = await mcpCache.get(cacheKey)!;
  return runtime?.tools ?? {};
};

export const invalidateMCPCache = (userId: string): void => {
  for (const key of mcpCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      mcpCache.get(key)?.then((r) => r?.client.disconnect().catch(() => undefined));
      mcpCache.delete(key);
    }
  }
};

export const closeMCP = async (): Promise<void> => {
  for (const [key, promise] of mcpCache.entries()) {
    const runtime = await promise;
    await runtime?.client.disconnect().catch(() => undefined);
    mcpCache.delete(key);
  }
};
