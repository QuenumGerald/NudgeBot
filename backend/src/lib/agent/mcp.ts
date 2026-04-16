import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { DynamicStructuredTool } from "@langchain/core/tools";

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
  client: MultiServerMCPClient;
  tools: DynamicStructuredTool[];
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
  const googleServiceAccount = parseGoogleCredentials();
  return {
    fetch: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@mokei/mcp-fetch"],
    },
    github: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: toEnv(process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_CONTEXT_TOKEN),
      },
    },
    google_calendar: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "mcp-google-calendar"],
      env: {
        ...process.env,
        GOOGLE_CLIENT_ID: toEnv(process.env.GOOGLE_CLIENT_ID),
        GOOGLE_CLIENT_SECRET: toEnv(process.env.GOOGLE_CLIENT_SECRET),
        GOOGLE_REFRESH_TOKEN: toEnv(process.env.GOOGLE_REFRESH_TOKEN),
        GOOGLE_SERVICE_ACCOUNT_JSON: toEnv(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      },
      ...(googleServiceAccount ? { serviceAccount: googleServiceAccount } : {}),
    },
    jira: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@devpuccino/mcp-jira"],
      env: {
        ...process.env,
        JIRA_API_TOKEN: toEnv(process.env.JIRA_API_TOKEN),
        JIRA_EMAIL: toEnv(process.env.JIRA_EMAIL),
        JIRA_URL: toEnv(process.env.JIRA_URL),
      },
    },
    confluence: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@devpuccino/mcp-confluence"],
      env: {
        ...process.env,
        CONFLUENCE_API_TOKEN: toEnv(process.env.CONFLUENCE_API_TOKEN || process.env.JIRA_API_TOKEN),
        CONFLUENCE_EMAIL: toEnv(process.env.CONFLUENCE_EMAIL || process.env.JIRA_EMAIL),
        CONFLUENCE_DOMAIN: toEnv(process.env.CONFLUENCE_URL),
      },
    },
    render: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "mcp-render"],
      env: {
        ...process.env,
        RENDER_API_KEY: toEnv(process.env.RENDER_API_KEY),
      },
    },
    netlify: {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@netlify/mcp"],
      env: {
        ...process.env,
        NETLIFY_AUTH_TOKEN: toEnv(process.env.NETLIFY_AUTH_TOKEN),
      },
    },
  };
};

const initializeMCP = async (enabledIntegrations: string[]): Promise<McpRuntime | null> => {
  if (enabledIntegrations.length === 0) return null;

  const allServers = ALL_SERVERS();
  const mcpServers = Object.fromEntries(
    enabledIntegrations
      .filter((id) => id in allServers)
      .map((id) => [id, allServers[id as IntegrationId]])
  );

  if (Object.keys(mcpServers).length === 0) return null;

  const client = new MultiServerMCPClient({
    throwOnLoadError: false,
    onConnectionError: "ignore",
    prefixToolNameWithServerName: true,
    mcpServers,
  });

  try {
    const tools = await client.getTools();
    console.log(`[mcp] loaded ${tools.length} tool(s) for integrations: ${enabledIntegrations.join(", ")}`);
    return { client, tools };
  } catch (error) {
    console.error("[mcp] MCP initialization failed, continuing without MCP tools.", error);
    await client.close().catch(() => undefined);
    return null;
  }
};

export const setupMCP = async (
  enabledIntegrations: string[],
  userId: string
): Promise<DynamicStructuredTool[]> => {
  if (enabledIntegrations.length === 0) return [];

  const cacheKey = `${userId}:${[...enabledIntegrations].sort().join(",")}`;

  if (!mcpCache.has(cacheKey)) {
    mcpCache.set(cacheKey, initializeMCP(enabledIntegrations));
  }

  const runtime = await mcpCache.get(cacheKey)!;
  return runtime?.tools ?? [];
};

export const invalidateMCPCache = (userId: string): void => {
  for (const key of mcpCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      mcpCache.get(key)?.then((r) => r?.client.close().catch(() => undefined));
      mcpCache.delete(key);
    }
  }
};

export const closeMCP = async (): Promise<void> => {
  for (const [key, promise] of mcpCache.entries()) {
    const runtime = await promise;
    await runtime?.client.close().catch(() => undefined);
    mcpCache.delete(key);
  }
};
