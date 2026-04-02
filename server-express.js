const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const next = require('next');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const API_ONLY = process.env.API_ONLY === 'true'; // Set to true for Render deployment

const nextApp = !API_ONLY ? next({ dev, dir: process.cwd() }) : null;
const handle = nextApp ? nextApp.getRequestHandler() : null;

const app = express();
const PORT = process.env.PORT || 3000;

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

// Auto-configure Cline on startup
function setupCline() {
  const clineDir = path.join(process.cwd(), 'data', '.cline', 'data');
  const secretsFile = path.join(clineDir, 'secrets.json');
  const globalStateFile = path.join(clineDir, 'globalState.json');

  // Create directories
  fs.mkdirSync(clineDir, { recursive: true });

  // Write secrets
  fs.writeFileSync(secretsFile, JSON.stringify({
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openAiApiKey: process.env.OPENAI_API_KEY || "",
  }, null, 2));

  // Write global state
  fs.writeFileSync(globalStateFile, JSON.stringify({
    actModeApiProvider: "deepseek",
    actModeDeepSeekModelId: "deepseek-chat",
    mode: "act",
    autoApprovalSettings: {
      version: 22,
      enabled: true,
      maxRequests: 20,
      actions: {
        readFiles: true,
        editFiles: true,
        executeSafeCommands: true,
        useBrowser: true,
        useMcp: true
      }
    }
  }, null, 2));

  console.log('✅ Cline configured automatically');
}

setupCline();

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
    const { messages, model } = req.body;
    const userMessage = messages[messages.length - 1].content;

    console.log('[API] Received message:', userMessage);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Call Cline CLI task in isolated workspace
    const workspacePath = path.join(process.cwd(), 'workspace');
    if (!fs.existsSync(workspacePath)) fs.mkdirSync(workspacePath, { recursive: true });

    const cline = spawn('npx', [
      'cline',
      'task',
      userMessage,
      '--config', path.join(process.cwd(), 'data', '.cline'),
      '--yolo',
      '--auto-condense',
      '--json'
    ], {
      cwd: workspacePath
    });

    let stdoutBuffer = '';
    let lastTextLength = 0;

    // Helper to parse and dispatch a single JSON event line
    function processEvent(line) {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.type === 'say') {
          if (event.say === 'completion_result') {
            const cleanText = (event.text || '')
              .replace(/<task_progress>[\s\S]*?(?:<\/task_progress>|$)/g, '')
              .trim();
            if (cleanText) {
              res.write(`data: ${JSON.stringify({ type: 'replace', content: cleanText })}\n\n`);
            }
          } else if (event.say === 'text') {
            const preview = (event.text || '').replace(/<task_progress>[\s\S]*?(?:<\/task_progress>|$)/g, '').trim();
            if (preview) {
              res.write(`data: ${JSON.stringify({ type: 'thinking', content: '💬 ' + preview.substring(0, 80) + (preview.length > 80 ? '...' : '') })}\n\n`);
            }
          } else if (event.say === 'api_req_started') {
            res.write(`data: ${JSON.stringify({ type: 'thinking', content: '🤔 Thinking...' })}\n\n`);
          } else if (event.say === 'task_progress') {
            res.write(`data: ${JSON.stringify({ type: 'thinking', content: '⚙️ ' + (event.text || 'Working...') })}\n\n`);
          } else if (event.say === 'error') {
            res.write(`data: ${JSON.stringify({ type: 'thinking', content: '❌ Error: ' + event.text })}\n\n`);
          }
        } else if (event.type === 'ask') {
          if (event.ask === 'tool_call' || event.ask === 'command') {
            try {
              const toolData = JSON.parse(event.text || '{}');
              res.write(`data: ${JSON.stringify({ type: 'thinking', content: '🛠️ Tool: ' + (toolData.tool || event.ask) })}\n\n`);
            } catch (e) {
              res.write(`data: ${JSON.stringify({ type: 'thinking', content: '🛠️ Using tool...' })}\n\n`);
            }
          }
        }
      } catch (e) {
        // Ignore invalid JSON lines (npm/npx noise)
      }
    }

    cline.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) processEvent(line);
    });

    cline.stderr.on('data', (data) => {
      const errLine = data.toString().trim();
      if (errLine) console.error(`[Cline] ${errLine}`);
    });

    cline.on('close', (code) => {
      // Flush any remaining buffered line (completion_result has no trailing newline)
      if (stdoutBuffer.trim()) processEvent(stdoutBuffer);

      console.log(`[API] Cline process closed with code: ${code}`);
      res.write(`data: ${JSON.stringify({ type: 'done', model: 'cline-cli' })}\n\n`);
      res.end();
    });
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
