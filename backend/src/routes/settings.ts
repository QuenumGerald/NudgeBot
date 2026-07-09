import { Router } from 'express';
import fs from 'fs';
import { getStore } from '../lib/githubStore.js';
import { invalidateMCPCache } from '../lib/agent/mcp.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function getProviderApiKeyEnvName(provider?: string | null): string {
  if (provider === 'openai') return 'OPENAI_API_KEY';
  if (provider === 'deepseek') return 'DEEPSEEK_API_KEY';
  if (provider === 'openrouter') return 'OPENROUTER_API_KEY';
  return 'LLM_API_KEY';
}

function updateEnvFile(filePath: string, updates: Record<string, string>) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }

  const lines = content.split('\n');
  const updatedKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      if (key in updates) {
        lines[i] = `${key}=${updates[key]}`;
        updatedKeys.add(key);
      }
    }
  }

  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      lines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

router.get('/:userId', async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  if (req.user?.id !== Number(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const store = await getStore();
    const settings = await store.getSettings(Number(userId));

    const config = {
      github_token: process.env.GITHUB_TOKEN || '',
      github_memory_repo: process.env.GITHUB_MEMORY_REPO || '',
      jira_api_token: process.env.JIRA_API_TOKEN || '',
      jira_email: process.env.JIRA_EMAIL || '',
      jira_url: process.env.JIRA_URL || '',
      confluence_api_token: process.env.CONFLUENCE_API_TOKEN || '',
      confluence_email: process.env.CONFLUENCE_EMAIL || '',
      confluence_url: process.env.CONFLUENCE_URL || '',
      google_client_id: process.env.GOOGLE_CLIENT_ID || '',
      google_client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      render_api_key: process.env.RENDER_API_KEY || '',
      netlify_auth_token: process.env.NETLIFY_AUTH_TOKEN || '',
    };

    if (!settings) {
      res.json({
        user_id: Number(userId),
        llm_provider: null,
        llm_model: null,
        llm_api_key: null,
        enabled_integrations: [],
        ...config,
      });
      return;
    }
    res.json({
      ...settings,
      enabled_integrations: settings.enabled_integrations
        ? JSON.parse(settings.enabled_integrations)
        : [],
      ...config,
    });
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:userId', async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  if (req.user?.id !== Number(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const {
    llm_provider,
    llm_model,
    llm_api_key,
    enabled_integrations,
    github_token,
    github_memory_repo,
    jira_api_token,
    jira_email,
    jira_url,
    confluence_api_token,
    confluence_email,
    confluence_url,
    google_client_id,
    google_client_secret,
    google_refresh_token,
    render_api_key,
    netlify_auth_token,
  } = req.body;

  try {
    const store = await getStore();
    const updated = await store.upsertSettings(Number(userId), {
      llm_provider,
      llm_model,
      enabled_integrations: enabled_integrations != null
        ? JSON.stringify(enabled_integrations)
        : undefined,
    });

    const updates: Record<string, string> = {};
    if (llm_provider !== undefined) updates.LLM_PROVIDER = llm_provider;
    if (llm_model !== undefined) updates.LLM_MODEL = llm_model || '';
    if (llm_api_key !== undefined) {
      updates[getProviderApiKeyEnvName(llm_provider ?? updated.llm_provider)] = llm_api_key;
    }
    if (github_token !== undefined) updates.GITHUB_TOKEN = github_token;
    if (github_memory_repo !== undefined) updates.GITHUB_MEMORY_REPO = github_memory_repo;
    if (jira_api_token !== undefined) updates.JIRA_API_TOKEN = jira_api_token;
    if (jira_email !== undefined) updates.JIRA_EMAIL = jira_email;
    if (jira_url !== undefined) updates.JIRA_URL = jira_url;
    if (confluence_api_token !== undefined) updates.CONFLUENCE_API_TOKEN = confluence_api_token;
    if (confluence_email !== undefined) updates.CONFLUENCE_EMAIL = confluence_email;
    if (confluence_url !== undefined) updates.CONFLUENCE_URL = confluence_url;
    if (google_client_id !== undefined) updates.GOOGLE_CLIENT_ID = google_client_id;
    if (google_client_secret !== undefined) updates.GOOGLE_CLIENT_SECRET = google_client_secret;
    if (google_refresh_token !== undefined) updates.GOOGLE_REFRESH_TOKEN = google_refresh_token;
    if (render_api_key !== undefined) updates.RENDER_API_KEY = render_api_key;
    if (netlify_auth_token !== undefined) updates.NETLIFY_AUTH_TOKEN = netlify_auth_token;

    const envFilePath = process.env.NUDGEBOT_ENV_PATH;
    if (envFilePath && Object.keys(updates).length > 0) {
      updateEnvFile(envFilePath, updates);
    }
    Object.assign(process.env, updates);

    // Invalidate MCP cache when integrations change
    if (enabled_integrations != null) {
      invalidateMCPCache(String(userId));
    }

    res.json({
      ...updated,
      enabled_integrations: updated.enabled_integrations
        ? JSON.parse(updated.enabled_integrations)
        : [],
      github_token: process.env.GITHUB_TOKEN || '',
      github_memory_repo: process.env.GITHUB_MEMORY_REPO || '',
      jira_api_token: process.env.JIRA_API_TOKEN || '',
      jira_email: process.env.JIRA_EMAIL || '',
      jira_url: process.env.JIRA_URL || '',
      confluence_api_token: process.env.CONFLUENCE_API_TOKEN || '',
      confluence_email: process.env.CONFLUENCE_EMAIL || '',
      confluence_url: process.env.CONFLUENCE_URL || '',
      google_client_id: process.env.GOOGLE_CLIENT_ID || '',
      google_client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      render_api_key: process.env.RENDER_API_KEY || '',
      netlify_auth_token: process.env.NETLIFY_AUTH_TOKEN || '',
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
