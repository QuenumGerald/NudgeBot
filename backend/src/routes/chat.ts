import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";
import { streamChatGraph } from "../lib/agent/graph.js";
import type { ChatMessage, StreamEvent } from "../types/index.js";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string().min(1)
    })
  )
});

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.post("/", async (req, res) => {
  try {
    const parsed = chatSchema.parse(req.body);

    const settings = db
      .prepare("SELECT llm_provider, llm_model, llm_api_key FROM settings WHERE user_id = ?")
      .get(req.session.user!.id) as
      | { llm_provider: string; llm_model: string; llm_api_key: string }
      | undefined;

    const provider = settings?.llm_provider ?? process.env.DEFAULT_LLM_PROVIDER ?? "openrouter";
    const model = settings?.llm_model ?? process.env.DEFAULT_LLM_MODEL ?? "deepseek/deepseek-chat";
    const apiKey =
      settings?.llm_api_key ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.DEEPSEEK_API_KEY;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });

    const sendEvent = (event: StreamEvent): void => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    };

    for await (const event of streamChatGraph(parsed.messages as ChatMessage[], {
      provider,
      model,
      apiKey
    })) {
      sendEvent(event);
    }

    res.end();
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache"
    });
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: "Chat failed." })}\n\n`);
    res.end();
  }
});
