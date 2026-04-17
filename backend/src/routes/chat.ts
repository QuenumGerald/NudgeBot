import { Router, Request, Response as ExpressResponse } from 'express';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { getAgent } from '../lib/agent/graph.js';
import { getStore } from '../lib/githubStore.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

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

const getGraphRecursionLimit = (): number => {
  const rawLimit = (process.env.LANGGRAPH_RECURSION_LIMIT || '').trim();
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return 50;
  }

  return parsedLimit;
};

type ChatBody = {
  messages?: Array<{ role?: string; content?: string }>;
};

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
          if (ctx.key_decisions?.length) parts.push(`Décisions: ${ctx.key_decisions.map(d => d.text).join("; ")}`);
          if (ctx.active_topics?.length) parts.push(`Sujets actifs: ${ctx.active_topics.join(", ")}`);
          if (ctx.next_actions?.length) parts.push(`Actions: ${ctx.next_actions.map(a => a.description).join("; ")}`);
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

    console.log('[chat] streaming start');

    const langchainMessages = messages.map((m) => {
      if (m?.role === 'assistant') return new AIMessage(String(m?.content ?? ''));
      return new HumanMessage(String(m?.content ?? ''));
    });

    const recursionLimit = getGraphRecursionLimit();
    const result = await agent.invoke(
      { messages: langchainMessages },
      { recursionLimit }
    ) as { messages?: Array<{ content?: unknown }> };

    const outMessages = Array.isArray(result?.messages) ? result.messages : [];
    const last = outMessages[outMessages.length - 1];
    const content = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');

    if (content) {
      res.write(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`);
    }

    // Save updated context back to GitHub
    try {
      const { getGitHubContextManager } = await import('../lib/githubContextManager.js');
      const mgr = getGitHubContextManager();
      if (mgr) {
        // Collect messages for context
        const allMessages = [
          ...langchainMessages,
          new AIMessage(content)
        ].map(m => ({
          role: m instanceof HumanMessage ? 'user' : 'assistant',
          content: String(m.content),
          timestamp: new Date().toISOString()
        }));

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
