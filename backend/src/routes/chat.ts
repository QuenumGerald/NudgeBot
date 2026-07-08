import { Router, Request, Response as ExpressResponse } from 'express';
import { getAgent } from '../lib/agent/graph.js';
import { getStore } from '../lib/githubStore.js';
import { applyContextBudget, getMaxInputTokensFromEnv } from '../lib/agent/contextBudget.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { toWellFormedUnicode } from '../lib/githubContextManager.js';
import fs from 'fs/promises';
import path from 'path';

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

const getAgentMaxSteps = (): number => {
  const rawLimit = (process.env.MASTRA_RECURSION_LIMIT || process.env.LANGGRAPH_RECURSION_LIMIT || '').trim();
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return 15; // Reduced default to prevent infinite tool loops
  }

  return parsedLimit;
};

type ChatBody = {
  conversation_id?: string;
  messages?: Array<{ role?: string; content?: string }>;
};

async function generateIntelligentSummary(
  droppedMessages: Array<{ role: string; content: string }>,
  provider: string,
  model: string,
  apiKey: string
): Promise<string> {
  const conversationText = droppedMessages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Utilisateur'}: ${m.content}`)
    .join('\n');

  const systemPrompt = `Tu es un assistant chargé de résumer les anciens messages d'une conversation pour ne pas perdre le contexte.
Rédige un résumé condensé, précis et structuré (en quelques puces) des faits importants, décisions, et sujets abordés dans la conversation ci-dessous.
Sois extrêmement concis et direct. Écris en français.`;

  let baseURL = 'https://api.openai.com/v1';
  let modelName = model || 'gpt-4o-mini';

  if (provider === 'deepseek') {
    const rawBase = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim();
    baseURL = rawBase.replace(/\/+$/, '') + '/v1';
    modelName = model || 'deepseek-chat';
  } else if (provider === 'openrouter') {
    baseURL = 'https://openrouter.ai/api/v1';
    modelName = model || 'deepseek/deepseek-chat:free';
  }

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationText }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('[contextBudget] Intelligent summary failed, falling back to basic summary:', err);
    return '';
  }
}


router.get('/conversations', async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const store = await getStore();
    res.json({ conversations: await store.listChatConversations(userId) });
  } catch (error) {
    console.error('[chat] conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

router.post('/conversations', async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const store = await getStore();
    res.status(201).json({ conversation: await store.createChatConversation(userId) });
  } catch (error) {
    console.error('[chat] create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

router.get('/conversations/:conversationId/history', async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const store = await getStore();
    const messagesJson = await store.getChatConversationHistory(userId, String(req.params.conversationId));
    res.json({ messages: messagesJson ? JSON.parse(messagesJson) : [] });
  } catch (error) {
    console.error('[chat] conversation history error:', error);
    res.status(500).json({ error: 'Failed to load conversation history' });
  }
});

router.get('/history', async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const store = await getStore();
    const messagesJson = await store.getChatHistory(userId);

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

  const { conversation_id: conversationId, messages } = req.body;
  const userId = req.user?.id;

  console.log('[chat] request', {
    hasMessages: Array.isArray(messages),
    messageCount: Array.isArray(messages) ? messages.length : 0,
    user_id: userId,
    conversation_id: conversationId,
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

  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
    console.log('[chat] response connection closed');
  });

  try {
    res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

    // Load user settings from store
    const store = await getStore();
    const userSettings = userId ? await store.getSettings(userId) : undefined;

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
      if (contextBudget.droppedMessages > 0) {
        try {
          const dropped = messages.slice(0, contextBudget.droppedMessages).map((m) => ({
            role: m.role || 'user',
            content: m.content || '',
          }));
          const intelligentSummary = await generateIntelligentSummary(dropped, provider, model, apiKey);
          if (intelligentSummary && contextBudget.messages.length > 0 && contextBudget.messages[0].content.startsWith('[Contexte compressé]')) {
            contextBudget.messages[0].content = `[Contexte compressé (Résumé IA)]\n${intelligentSummary}`;
            console.log('[chat] prepended intelligent context summary successfully');
          }
        } catch (sumErr) {
          console.error('[chat] failed to generate intelligent context summary:', sumErr);
        }
      }
    }

    // Convert to LangGraph/AI SDK message format
    const agentMessages = contextBudget.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: toWellFormedUnicode(m.content || ''),
    }));

    const maxSteps = getAgentMaxSteps();
    const result = await agent.stream(agentMessages, { maxSteps, runId: `req-${Date.now()}` });

    let content = '';

    for await (const rawChunk of result.fullStream) {
      if (controller.signal.aborted) {
        break;
      }

      const chunk = rawChunk as any;
      const payload = chunk.payload ?? chunk;

      if (chunk.type === 'text-delta') {
        const text = payload.text ?? payload.delta ?? '';
        content += text;
        res.write(`data: ${JSON.stringify({ type: 'delta', content: text })}\n\n`);
      } else if (chunk.type === 'tool-call') {
        res.write(`data: ${JSON.stringify({
          type: 'tool_start',
          tool_name: payload.toolName,
          input: payload.args ?? payload.input
        })}\n\n`);
      } else if (chunk.type === 'tool-result') {
        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          tool_name: payload.toolName,
          result: payload.result ?? payload.output
        })}\n\n`);
      } else if (chunk.type === 'error') {
        const streamError = payload.error;
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: streamError instanceof Error ? streamError.message : String(streamError)
        })}\n\n`);
      }
    }

    // Save updated context back to GitHub & locally
    try {
      const allMessages = [
        ...agentMessages,
        { role: 'assistant', content: toWellFormedUnicode(content) },
      ].map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(),
      }));

      // 1. Save history to the store (Neon Postgres or local fallback)
      const store = await getStore();
      if (conversationId) {
        await store.saveChatConversationHistory(Number(userId), conversationId, JSON.stringify(allMessages, null, 2));
      } else {
        await store.saveChatHistory(Number(userId), JSON.stringify(allMessages, null, 2));
      }

      // 2. Save compressed summary context to GitHub
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
