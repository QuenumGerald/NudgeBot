import { isPolyfilled } from "../../polyfill.js";
if (!isPolyfilled) console.log("[mcp] polyfill failed");
import { jsonSchema } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { runVerifiedAction } from "./actaro.js";

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
  clients: Client[];
  transports: StdioClientTransport[];
  tools: Record<string, any>;
};

const mcpCache = new Map<string, Promise<McpRuntime | null>>();

const toEnv = (value?: string) => (value ?? "").trim();

const disconnectClients = async (runtime?: Pick<McpRuntime, "clients" | "transports">): Promise<void> => {
  if (!runtime) return;
  await Promise.all(runtime.clients.map((client) => client.close().catch(() => undefined)));
  await Promise.all(runtime.transports.map((transport) => transport.close().catch(() => undefined)));
};

const getBaseEnv = () => ({
  ...(process.env as Record<string, string>),
  NODE_OPTIONS: "--experimental-global-webcrypto",
});

const ALL_SERVERS = () => ({
  fetch: {
    command: "npx",
    args: ["-y", "@mokei/mcp-fetch"],
    env: getBaseEnv(),
  },
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      ...getBaseEnv(),
      GITHUB_PERSONAL_ACCESS_TOKEN: toEnv(process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_CONTEXT_TOKEN),
    },
  },
  google_calendar: {
    command: "npx",
    args: ["-y", "mcp-google-calendar"],
    env: {
      ...getBaseEnv(),
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
      ...getBaseEnv(),
      JIRA_API_TOKEN: toEnv(process.env.JIRA_API_TOKEN),
      JIRA_EMAIL: toEnv(process.env.JIRA_EMAIL),
      JIRA_URL: toEnv(process.env.JIRA_URL),
    },
  },
  confluence: {
    command: "npx",
    args: ["-y", "@devpuccino/mcp-confluence"],
    env: {
      ...getBaseEnv(),
      CONFLUENCE_API_TOKEN: toEnv(process.env.CONFLUENCE_API_TOKEN || process.env.JIRA_API_TOKEN),
      CONFLUENCE_EMAIL: toEnv(process.env.CONFLUENCE_EMAIL || process.env.JIRA_EMAIL),
      CONFLUENCE_DOMAIN: toEnv(process.env.CONFLUENCE_URL),
    },
  },
  render: {
    command: "npx",
    args: ["-y", "mcp-render"],
    env: { ...getBaseEnv(), RENDER_API_KEY: toEnv(process.env.RENDER_API_KEY) },
  },
  netlify: {
    command: "npx",
    args: ["-y", "@netlify/mcp"],
    env: { ...getBaseEnv(), NETLIFY_AUTH_TOKEN: toEnv(process.env.NETLIFY_AUTH_TOKEN) },
  },
});

const initializeMCP = async (enabledIntegrations: string[], cacheKey: string): Promise<McpRuntime | null> => {
  if (enabledIntegrations.length === 0) return null;

  const allServers = ALL_SERVERS();
  const clients: Client[] = [];
  const transports: StdioClientTransport[] = [];
  const tools: Record<string, any> = {};

  for (const integrationId of enabledIntegrations) {
    if (!(integrationId in allServers)) continue;
    const server = allServers[integrationId as IntegrationId];
    const client = new Client({ name: `nudgebot-${cacheKey}-${integrationId}`, version: "1.0.0" });
    const transport = new StdioClientTransport(server);

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      for (const mcpTool of listed.tools ?? []) {
        const toolName = `${integrationId}_${mcpTool.name}`;
        const schema = jsonSchema(mcpTool.inputSchema as any);
        tools[toolName] = {
          id: toolName,
          description: mcpTool.description || `MCP tool ${mcpTool.name} from ${integrationId}.`,
          inputSchema: schema,
          execute: async (input: Record<string, unknown>) => {
            const { output } = await runVerifiedAction({
              name: toolName,
              description: mcpTool.description || `MCP tool ${mcpTool.name} from ${integrationId}.`,
              inputSchema: schema,
              input,
              execute: async (inp) => {
                const res = await client.callTool({
                  name: mcpTool.name,
                  arguments: inp,
                });
                return JSON.stringify(res.content ?? res, null, 2);
              },
              verify: async (_inp, executeResult) => {
                if (executeResult && typeof executeResult === "string" && executeResult.length > 0) {
                  return {
                    status: "verified" as const,
                    evidence: {
                      integration: integrationId,
                      mcpTool: mcpTool.name,
                      contentLength: executeResult.length,
                    },
                  };
                }
                return { status: "failed" as const, reason: "Empty response from MCP tool." };
              },
            });
            return output;
          },
        };
      }
      clients.push(client);
      transports.push(transport);
      console.log(`[mcp] loaded ${Object.keys(tools).length} total tool(s) after integration: ${integrationId}`);
    } catch (error) {
      console.error(`[mcp] MCP initialization failed for integration '${integrationId}', continuing without it.`, error);
      await disconnectClients({ clients: [client], transports: [transport] });
    }
  }

  if (Object.keys(tools).length === 0) {
    await disconnectClients({ clients, transports });
    return null;
  }

  return { clients, transports, tools };
};

export const setupMCP = async (enabledIntegrations: string[], userId: string): Promise<Record<string, any>> => {
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
      mcpCache.get(key)?.then((runtime) => disconnectClients(runtime ?? undefined));
      mcpCache.delete(key);
    }
  }
};

export const closeMCP = async (): Promise<void> => {
  for (const [key, promise] of mcpCache.entries()) {
    const runtime = await promise;
    await disconnectClients(runtime ?? undefined);
    mcpCache.delete(key);
  }
};
