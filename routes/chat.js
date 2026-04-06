const { Router } = require('express');
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { buildAgentGraph } = require("../lib/agent/graph");
const { SYSTEM_PROMPT } = require("../lib/agent/tools");
const { getMCPTools, getBaseURL } = require("../lib/agent/mcp");

const router = Router();

// Lazy-load getSettings to avoid circular require at startup (db.ts is compiled TS)
async function loadSettings() {
  try {
    const { getSettings } = require("../lib/db");
    return await getSettings();
  } catch {
    return {};
  }
}

function sseWrite(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractTextContent(chunk) {
  if (typeof chunk.content === "string") return chunk.content;
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map(part => (typeof part === "string" ? part : part?.type === "text" ? part.text : ""))
      .join("");
  }
  return "";
}

router.post('/', async (req, res) => {
  const { messages, model: modelOverride } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided" });
  }

  const userMessage = messages[messages.length - 1].content;
  console.log('[Chat] Message:', userMessage.slice(0, 100));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseWrite(res, { type: 'thinking', content: '🤔 Thinking...' });

  // Load settings from DB (falls back to env vars if DB unavailable)
  const settings = await loadSettings();
  const model = settings.llm_model || modelOverride || process.env.DEFAULT_MODEL || "deepseek/deepseek-chat";
  const apiKey = settings.llm_api_key || process.env.OPENROUTER_API_KEY || "";
  const baseURL = getBaseURL(settings.llm_provider);

  // Load MCP tools from configured integrations
  const mcpTools = await getMCPTools(settings);

  const agentGraph = buildAgentGraph({ model, apiKey, baseURL, mcpTools });

  const graphMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    ...messages.slice(0, -1).map(m =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];

  try {
    for await (const event of agentGraph.streamEvents({ messages: graphMessages }, { version: "v2" })) {
      if (event.event === "on_chat_model_stream") {
        const content = extractTextContent(event.data?.chunk ?? {});
        if (content) sseWrite(res, { type: "delta", content });

      } else if (event.event === "on_tool_start") {
        const input = JSON.stringify(event.data?.input ?? {});
        console.log(`[Tool] ${event.name}:`, input.slice(0, 100));
        sseWrite(res, { type: "tool_start", name: event.name, input });

      } else if (event.event === "on_tool_end") {
        sseWrite(res, { type: "tool_result", name: event.name, output: String(event.data?.output ?? "") });
      }
    }
  } catch (err) {
    console.error("[LangGraph] Stream error:", err);
    sseWrite(res, { type: "error", message: err.message });
  }

  sseWrite(res, { type: 'done', model });
  res.end();
});

module.exports = router;
