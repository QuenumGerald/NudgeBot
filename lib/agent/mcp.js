const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

const PROVIDER_BASE_URLS = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  deepseek: "https://api.deepseek.com/v1",
};

function getBaseURL(provider) {
  return PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.openrouter;
}

async function getMCPTools(settings) {
  const servers = {};

  if (settings.github_token) {
    servers.github = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { ...process.env, GITHUB_TOKEN: settings.github_token },
    };
  }

  if (settings.jira_host && settings.jira_email && settings.jira_api_token) {
    servers.jira = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-atlassian"],
      env: {
        ...process.env,
        JIRA_URL: settings.jira_host,
        JIRA_USERNAME: settings.jira_email,
        JIRA_API_TOKEN: settings.jira_api_token,
      },
    };
  }

  if (settings.google_client_id && settings.google_client_secret && settings.google_refresh_token) {
    servers.google = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-google-calendar"],
      env: {
        ...process.env,
        GOOGLE_CLIENT_ID: settings.google_client_id,
        GOOGLE_CLIENT_SECRET: settings.google_client_secret,
        GOOGLE_REFRESH_TOKEN: settings.google_refresh_token,
      },
    };
  }

  // Custom MCP servers added via the settings UI
  if (settings.mcp_servers) {
    try {
      const custom = JSON.parse(settings.mcp_servers);
      for (const server of custom) {
        if (!server.name || !server.command) continue;
        let env = { ...process.env };
        if (server.env) {
          try { Object.assign(env, JSON.parse(server.env)); } catch { /* ignore bad JSON */ }
        }
        servers[server.name] = {
          transport: "stdio",
          command: server.command,
          args: server.args ? server.args.split(" ").filter(Boolean) : [],
          env,
        };
      }
    } catch {
      console.warn("[MCP] Failed to parse mcp_servers setting");
    }
  }

  if (Object.keys(servers).length === 0) return [];

  try {
    const client = new MultiServerMCPClient(servers);
    const tools = await client.getTools();
    console.log(`[MCP] Loaded ${tools.length} tools from ${Object.keys(servers).join(", ")}`);
    return tools;
  } catch (err) {
    console.error("[MCP] Failed to load tools:", err.message);
    return [];
  }
}

module.exports = { getMCPTools, getBaseURL };
