import { Router, Request, Response as ExpressResponse } from 'express';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { getAgent } from '../lib/agent/graph.js';
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
    // Let the client know the stream is alive as early as possible
    res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

    const { provider, model, apiKey } = getLLMConfigFromEnv();

    console.log('[chat] llm config', {
      provider,
      model,
      hasApiKey: Boolean(apiKey),
    });

    if (!apiKey) {
      throw new Error('LLM API key not configured');
    }

    const agent = getAgent(provider, model, apiKey);

    console.log('[chat] streaming start');

    const langchainMessages = messages.map((m) => {
      if (m?.role === 'assistant') return new AIMessage(String(m?.content ?? ''));
      return new HumanMessage(String(m?.content ?? ''));
    });

    const result = await agent.invoke({ messages: langchainMessages }) as { messages?: Array<{ content?: unknown }> };

    const outMessages = Array.isArray(result?.messages) ? result.messages : [];
    const last = outMessages[outMessages.length - 1];
    const content = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');

    if (content) {
      res.write(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`);
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
