import { Router, Request, Response as ExpressResponse } from 'express';
import { getAgent } from '../lib/agent/graph.js';
import { getStore } from '../lib/githubStore.js';
import { applyContextBudget, getMaxInputTokensFromEnv } from '../lib/agent/contextBudget.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { toWellFormedUnicode } from '../lib/githubContextManager.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

const getLocalHistoryPath = (userId: string) => {
  return path.join(process.cwd(), 'workspace', `history_${userId}.json`);
};

const getLLMConfigFromEnv = () => {
  const provider = (process.env.LLM_PROVIDER || 'deepseek').trim();
  const model = (process.env.LLM_MODEL || '').trim();

  let apiKey = '';
  if (provider === 'deepseek') {
    apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  } else if (provider === 'openrouter') {
    apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  } else if (provider === 'openai') {
    apiKey = (process.env.OPENAI_API_KEY || '').trim();
  } else {
    apiKey = (process.env.LLM_API_KEY || '').trim();
  }

  return { provider, model, apiKey };
};

const getAgentMaxSteps = (): number => {
  const rawLimit = (process.env.MASTRA_RECURSION_LIMIT || process.env.LANGGRAPH_RECURSION_LIMIT || '').trim();
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return 200;
  }

  return parsedLimit;
};

type ChatBody = {
  messages?: Array<{ role?: string; content?: string }>;
};


router.get('/history', async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const localPath = getLocalHistoryPath(String(userId));
    let messagesJson: string | null = null;
    try {
      messagesJson = await fs.readFile(localPath, 'utf-8');
    } catch {
      // Fallback: check GitHub messages.json once to migrate
      const { getGitHubContextManager } = await import('../lib/githubContextManager.js');
      const mgr = getGitHubContextManager();
      if (mgr) {
        messagesJson = await mgr.getFile(`users/${userId}/messages.json`);
        if (messagesJson) {
          // Save locally so we don't hit GitHub again
          try {
            await fs.mkdir(path.dirname(localPath), { recursive: true });
            await fs.writeFile(localPath, messagesJson, 'utf-8');
          } catch (writeErr) {
            console.error('[chat] failed to save migrated history locally:', writeErr);
          }
        }
      }
    }

    if (messagesJson) {
      res.json({ messages: JSON.parse(messagesJson) });
    } else {
      res.json({ messages: [] });
    }
  } catch (error) {
    console.error('[chat] history error:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.post('/', async (req: AuthenticatedRequest & Request<unknown, unknown, ChatBody>, res: ExpressResponse) => {

  const { messages } = req.body;
  const userId = req.user?.id;

  console.log('[chat] request', {
    hasMessages: Array.isArray(messages),
    messageCount: Array.isArray(messages) ? messages.length : 0,
    user_id: userId,
  });

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as any).flushHeaders?.();

  try {
    res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

    // Load user settings from store
    const store = await getStore();
    const userSettings = userId ? store.getSettings(userId) : undefined;

    const envConfig = getLLMConfigFromEnv();
    const provider = userSettings?.llm_provider || envConfig.provider;
    const model = userSettings?.llm_model || envConfig.model;
    const apiKey = userSettings?.llm_api_key || envConfig.apiKey;

    const enabledIntegrations: string[] = userSettings?.enabled_integrations
      ? JSON.parse(userSettings.enabled_integrations)
      : [];

    console.log('[chat] llm config', {
      provider,
      model,
      hasApiKey: Boolean(apiKey),
      integrations: enabledIntegrations,
    });

    if (!apiKey) {
      throw new Error('LLM API key not configured');
    }

    // Load previous context from GitHub if available
    let previousContext: string | null = null;
    try {
      const { getGitHubContextManager } = await import('../lib/githubContextManager.js');
      const mgr = getGitHubContextManager();
      if (mgr) {
        const ctx = await mgr.loadUserContext(String(userId ?? ''));
        if (ctx) {
          const parts: string[] = [];
          if (ctx.summary) parts.push(`Résumé: ${ctx.summary}`);
          if (ctx.key_decisions?.length) parts.push(`Décisions: ${ctx.key_decisions.map((d: any) => d.text).join("; ")}`);
          if (ctx.active_topics?.length) parts.push(`Sujets actifs: ${ctx.active_topics.join(", ")}`);
          if (ctx.next_actions?.length) parts.push(`Actions: ${ctx.next_actions.map((a: any) => a.description).join("; ")}`);
          if (parts.length) previousContext = parts.join("\n");
        }
      }
    } catch {
      // GitHub context not configured — continue without
    }

    const agent = await getAgent(
      provider,
      model,
      apiKey,
      enabledIntegrations,
      String(userId ?? ''),
      previousContext
    );

    console.log('[chat] generation start');

    const contextBudget = applyContextBudget(messages, {
      maxInputTokens: getMaxInputTokensFromEnv(),
    });

    if (contextBudget.wasTrimmed) {
      console.warn('[chat] context trimmed', {
        estimatedTokens: contextBudget.estimatedTokens,
        droppedMessages: contextBudget.droppedMessages,
      });
    }

    // Convert to Mastra/AI SDK message format
    const agentMessages = contextBudget.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: toWellFormedUnicode(m.content || ''),
    }));

    const maxSteps = getAgentMaxSteps();
    const result = await agent.stream(agentMessages, { maxSteps });

    let content = '';

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        const text = chunk.payload.text || '';
        content += text;
        res.write(`data: ${JSON.stringify({ type: 'delta', content: text })}\n\n`);
      } else if (chunk.type === 'tool-call') {
        res.write(`data: ${JSON.stringify({
          type: 'tool_start',
          tool_name: chunk.payload.toolName,
          input: chunk.payload.args
        })}\n\n`);
      } else if (chunk.type === 'tool-result') {
        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          tool_name: chunk.payload.toolName,
          result: chunk.payload.result
        })}\n\n`);
      } else if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: chunk.payload.error instanceof Error ? chunk.payload.error.message : String(chunk.payload.error)
        })}\n\n`);
      }
    }

    // Save updated context back to GitHub & locally
    try {
      const localPath = getLocalHistoryPath(String(userId ?? ''));
      const allMessages = [
        ...agentMessages,
        { role: 'assistant', content: toWellFormedUnicode(content) },
      ].map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(),
      }));

      // 1. Save full history locally (instant)
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, JSON.stringify(allMessages, null, 2), 'utf-8');

      // 2. Save only compressed summary context to GitHub
      const { getGitHubContextManager } = await import('../lib/githubContextManager.js');
      const mgr = getGitHubContextManager();
      if (mgr) {
        await mgr.saveUserContext(String(userId ?? ''), { messages: allMessages });
      }
    } catch (saveError) {
      console.error('[chat] failed to save context:', saveError);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server Error';
    console.error('Chat API Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    res.end();
  }
});

export default router;
