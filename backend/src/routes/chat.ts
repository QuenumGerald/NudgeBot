import { Router, Request, Response as ExpressResponse } from 'express';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { getAgent } from '../lib/agent/graph.js';
import { getStore } from '../lib/githubStore.js';
import { applyContextBudget, getMaxInputTokensFromEnv } from '../lib/agent/contextBudget.js';
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

const getAgentMaxSteps = (): number => {
  const rawLimit = (process.env.LANGGRAPH_RECURSION_LIMIT || '').trim();
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return 200;
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

  try {
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
      res.status(500).json({ error: 'LLM API key not configured' });
      return;
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
          if (ctx.key_decisions?.length) parts.push(`Décisions: ${ctx.key_decisions.map((d: any) => d.text).join('; ')}`);
          if (ctx.active_topics?.length) parts.push(`Sujets actifs: ${ctx.active_topics.join(', ')}`);
          if (ctx.next_actions?.length) parts.push(`Actions: ${ctx.next_actions.map((a: any) => a.description).join('; ')}`);
          if (parts.length) previousContext = parts.join('\n');
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

    const agentMessages = contextBudget.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const maxSteps = getAgentMaxSteps();

    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = await agent.stream(agentMessages, { maxSteps });

        // Convert Mastra fullStream chunks to AI SDK UIMessageChunks
        for await (const chunk of result.fullStream) {
          switch (chunk.type) {
            case 'text-start':
              writer.write({ type: 'text-start', id: chunk.payload.id } as any);
              break;
            case 'text-delta':
              writer.write({ type: 'text-delta', id: chunk.payload.id, delta: chunk.payload.text } as any);
              break;
            case 'text-end':
              writer.write({ type: 'text-end', id: chunk.payload.id } as any);
              break;
            case 'tool-call':
              writer.write({
                type: 'tool-call',
                toolCallId: chunk.payload.toolCallId,
                toolName: chunk.payload.toolName,
                input: chunk.payload.args ?? {},
              } as any);
              break;
            case 'tool-result':
              writer.write({
                type: 'tool-result',
                toolCallId: chunk.payload.toolCallId,
                toolName: chunk.payload.toolName,
                result: chunk.payload.result,
              } as any);
              break;
          }
        }

        // Save context in background after stream completes
        result.text
          .then(async (content) => {
            try {
              const { getGitHubContextManager } = await import('../lib/githubContextManager.js');
              const mgr = getGitHubContextManager();
              if (mgr) {
                await mgr.saveUserContext(String(userId ?? ''), {
                  messages: [
                    ...agentMessages,
                    { role: 'assistant', content },
                  ].map((m) => ({
                    role: m.role,
                    content: m.content,
                    timestamp: new Date().toISOString(),
                  })),
                });
              }
            } catch (saveError) {
              console.error('[chat] failed to save context:', saveError);
            }
          })
          .catch(console.error);
      },
      onError: (error) => {
        console.error('[chat] stream error:', error);
        return error instanceof Error ? error.message : 'Stream Error';
      },
    });

    pipeUIMessageStreamToResponse({ response: res, stream: uiStream });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server Error';
    console.error('[chat] API Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

export default router;
