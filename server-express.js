const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');
require('dotenv').config();

const { StateGraph, MemorySaver, Annotation } = require("@langchain/langgraph");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");

const dev = process.env.NODE_ENV !== 'production';
const API_ONLY = process.env.API_ONLY === 'true'; // Set to true for Render deployment

const nextApp = !API_ONLY ? next({ dev, dir: process.cwd() }) : null;
const handle = nextApp ? nextApp.getRequestHandler() : null;

const app = express();
const PORT = process.env.PORT || 3000;

// Global memory for LangGraph agent
const memory = new MemorySaver();

// Enable CORS for Netlify
app.use(cors({
  origin: '*', // Allow all origins for testing, we can restrict to netlify.app later
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Keep the process alive and log errors instead of crashing
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});
// Keepalive: prevents Node from exiting when event loop is empty
setInterval(() => { }, 1000 * 60 * 60);


app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const appPassword = process.env.APP_PASSWORD;
  const appSecret = process.env.APP_SECRET;

  if (!appPassword || !appSecret) {
    return res.status(500).json({ ok: false, error: "Configuration serveur incorrecte" });
  }

  const { password, action } = req.body;

  if (action === "logout") {
    res.clearCookie("nudgebot-session");
    return res.json({ ok: true });
  }

  if (password === appPassword) {
    res.cookie("nudgebot-session", appSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  setTimeout(() => {
    res.status(401).json({ ok: false, error: "Mot de passe incorrect" });
  }, 500);
});

// Chat endpoint with DeepSeek API
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, sessionId } = req.body;
    const userMessage = messages[messages.length - 1].content;

    console.log('[API] Received message:', userMessage);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ type: 'thinking', content: '🤔 Thinking...' })}\n\n`);

    const GraphState = Annotation.Root({
      messages: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
      }),
    });

    const apiKey = process.env.OPENROUTER_API_KEY || "";
    const activeModel = model || "qwen/qwen3.6-plus-preview:free";

    async function callModel(state) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nudgebot.app",
          "X-Title": "Nudgebot",
        },
        body: JSON.stringify({
          model: activeModel,
          messages: state.messages.map(m => ({
            role: m instanceof HumanMessage ? "user" : m instanceof SystemMessage ? "system" : "assistant",
            content: m.content
          })),
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              res.write(`data: ${JSON.stringify({ type: "replace", content: fullContent })}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      return { messages: [new AIMessage(fullContent)] };
    }

    const workflow = new StateGraph(GraphState)
      .addNode("agent", callModel)
      .addEdge("__start__", "agent")
      .addEdge("agent", "__end__");

    const appGraph = workflow.compile({ checkpointer: memory });

    const graphMessages = [
      new SystemMessage("You are NudgeBot, an expert security and code audit assistant. ALWAYS respond in English."),
      new HumanMessage(userMessage)
    ];

    const config = { configurable: { thread_id: sessionId || "default" } };

    try {
      await appGraph.invoke({ messages: graphMessages }, config);
    } catch (e) {
      console.error("[LangGraph] Error during execution", e);
      res.write(`data: ${JSON.stringify({ type: "error", message: e.message })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done', model: activeModel })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[API] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })} \n\n`);
    res.end();
  }
});

// Deployment logic: either Next.js Custom Server (Local) or API-Only (Render)
if (API_ONLY) {
  // --- Render Mode (API ONLY) ---
  const server = app.listen(PORT, () => {
    console.log(`🚀 NudgeBot API STANDALONE running on port ${PORT}`);
    console.log(`📝 Model: ${process.env.DEFAULT_MODEL || 'deepseek/deepseek-chat'}`);
  });
  server.on('error', (err) => console.error('[SERVER] Error:', err));
} else if (nextApp) {
  // --- Local Mode (Hybrid Server) ---
  nextApp.prepare()
    .then(() => {
      app.use(async (req, res) => {
        try {
          await handle(req, res);
        } catch (err) {
          console.error('[Next.js] Request error:', err);
          res.status(500).end('Internal Server Error');
        }
      });

      const server = app.listen(PORT, () => {
        console.log(`✅ NudgeBot Hybrid server running on http://localhost:${PORT}`);
      });

      server.on('error', (err) => console.error('[SERVER] Error:', err));
    })
    .catch((err) => {
      console.error('[Next.js] Failed to prepare:', err);
      app.listen(PORT, () => console.log(`⚠️  NudgeBot API-Safe (port ${PORT})`));
    });
}
