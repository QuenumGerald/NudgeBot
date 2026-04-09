import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';
import { getAgent } from '../lib/agent/graph';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  // We expect user_id for fetching settings, and messages array
  const { user_id, messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const db = await getDb();
    // Default to admin user id 1 if not provided
    const userId = user_id || 1;
    const settings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId);

    if (!settings) {
      throw new Error('User settings not found');
    }

    const { llm_provider, llm_model, llm_api_key } = settings;

    if (!llm_api_key) {
      throw new Error('LLM API key not configured');
    }

    const agent = getAgent(llm_provider, llm_model, llm_api_key);

    // Send thinking event
    res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    // Stream from LangGraph
    const stream = await agent.streamEvents(
      { messages },
      { version: "v2", signal: abortController.signal }
    );

    for await (const event of stream) {
      if (abortController.signal.aborted) break;

      if (event.event === "on_chat_model_stream") {
        const content = event.data?.chunk?.content;
        if (content) {
           res.write(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`);
        }
      } else if (event.event === "on_tool_start") {
        res.write(`data: ${JSON.stringify({
          type: 'tool_start',
          tool_name: event.name,
          input: event.data?.input
        })}\n\n`);
      } else if (event.event === "on_tool_end") {
        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          tool_name: event.name,
          result: event.data?.output
        })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error('Chat API Error:', error);
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Server Error' });
    } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
  }
});

export default router;
