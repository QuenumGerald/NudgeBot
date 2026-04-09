import { Router, Request, Response } from 'express';
import { db } from '../lib/db';
import { createAgentGraph } from '../lib/agent/graph';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Invalid messages format' });
    return;
  }

  try {
    // 1. Fetch user settings
    const settings: any = db.prepare('SELECT llm_provider, llm_model, llm_api_key FROM settings WHERE user_id = ?').get(req.session.userId);

    const config = {
      provider: settings?.llm_provider || 'openrouter',
      model: settings?.llm_model || 'deepseek/deepseek-chat',
      apiKey: settings?.llm_api_key || process.env.OPENROUTER_API_KEY || ''
    };

    // 2. Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Helper to send SSE
    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 3. Convert input messages to Langchain format
    const lcMessages = messages.map(m => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') {
        const msg = new AIMessage(m.content);
        if (m.tool_calls) {
          msg.tool_calls = m.tool_calls;
        }
        return msg;
      }
      if (m.role === 'tool') return new ToolMessage({ content: m.content, tool_call_id: m.tool_call_id });
      return new HumanMessage(m.content); // fallback
    });

    sendEvent('thinking', { status: true });

    // 4. Create and run agent
    const graph = createAgentGraph(config);
    const stream = await graph.streamEvents({ messages: lcMessages }, { version: 'v2' });

    for await (const event of stream) {
      const { event: eventType, data } = event;

      if (eventType === 'on_chat_model_stream') {
        const chunk = data.chunk;
        if (chunk.content) {
          sendEvent('delta', { content: chunk.content });
        }
      } else if (eventType === 'on_tool_start') {
         sendEvent('tool_start', { name: event.name, input: data.input });
      } else if (eventType === 'on_tool_end') {
         sendEvent('tool_result', { name: event.name, result: data.output });
      } else if (eventType === 'on_chat_model_end') {
         // Model finished
      }
    }

    sendEvent('done', { status: true });
    res.end();

  } catch (error: any) {
    console.error('Chat error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

export default router;
