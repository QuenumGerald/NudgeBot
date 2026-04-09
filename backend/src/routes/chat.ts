import { Router, Request, Response as ExpressResponse } from 'express';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { getAgent } from '../lib/agent/graph';
import { getDb } from '../lib/db';
import { getSessionManager } from '../lib/renderSessionManager';

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

router.post('/', async (req: Request, res: ExpressResponse) => {
  // We expect user_id for fetching settings, and messages array
  const { user_id, messages } = req.body;

  console.log('[chat] request', {
    hasMessages: Array.isArray(messages),
    messageCount: Array.isArray(messages) ? messages.length : 0,
    user_id,
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
    // Let the client know the stream is alive as early as possible
    res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

    const db = await getDb();
    const userSettings = user_id
      ? await db.get('SELECT * FROM settings WHERE user_id = ?', user_id)
      : null;

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

    // Load previous session context from GitHub (no-op if persistence not configured)
    const sessionManager = getSessionManager();
    const userId = String(user_id ?? '');
    await sessionManager.loadUserSession(userId);
    const previousContext = sessionManager.getContextSummaryForPrompt(userId);

    const agent = await getAgent(provider, model, apiKey, enabledIntegrations, userId, previousContext);

    console.log('[chat] streaming start');

    const langchainMessages = messages.map((m: any) => {
      if (m?.role === 'assistant') return new AIMessage(String(m?.content ?? ''));
      return new HumanMessage(String(m?.content ?? ''));
    });

    // Track incoming user messages
    const lastUserMessage = [...messages].reverse().find((m: any) => m?.role === 'user');
    if (lastUserMessage) {
      sessionManager.addMessage(userId, 'user', String(lastUserMessage.content ?? ''));
    }

    const result: any = await agent.invoke({ messages: langchainMessages });

    const outMessages = Array.isArray(result?.messages) ? result.messages : [];
    const last = outMessages[outMessages.length - 1];
    const content = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');

    if (content) {
      // Track assistant response
      sessionManager.addMessage(userId, 'assistant', content);
      // Save every 5 messages (non-blocking)
      const stats = sessionManager.getSessionStats(userId);
      if (stats && stats.messageCount % 5 === 0) {
        sessionManager.saveUserSession(userId).catch(console.error);
      }

      res.write(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Chat API Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Server Error' })}\n\n`);
    res.end();
  }
});

export default router;
