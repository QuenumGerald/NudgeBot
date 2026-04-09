const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const next = require('next');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const API_ONLY = process.env.API_ONLY === 'true'; // Set to true for Render deployment

const nextApp = !API_ONLY ? next({ dev, dir: process.cwd() }) : null;
const handle = nextApp ? nextApp.getRequestHandler() : null;

const app = express();
const PORT = process.env.PORT || 3000;
const WORKSPACE_PATH = path.join(process.cwd(), 'workspace');
const CLINE_BIN = path.join(process.cwd(), 'node_modules', '.bin', 'cline');
const CLINE_CONFIG = path.join(WORKSPACE_PATH, '.cline');

function resolveWorkspacePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error("Le paramètre 'path' est requis.");
  }

  const normalizedPath = path.normalize(inputPath.trim());
  const absolutePath = path.resolve(WORKSPACE_PATH, normalizedPath);
  const workspaceRoot = path.resolve(WORKSPACE_PATH) + path.sep;

  if (absolutePath !== path.resolve(WORKSPACE_PATH) && !absolutePath.startsWith(workspaceRoot)) {
    throw new Error("Chemin refusé: accès en dehors du workspace.");
  }

  return absolutePath;
}

function runFileTool(tool, parameters = {}) {
  switch (tool) {
    case 'create_file': {
      const filePath = resolveWorkspacePath(parameters.path);
      const content = parameters.content ?? '';
      const mode = parameters.mode === 'append' ? 'append' : 'write';

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (mode === 'append') {
        fs.appendFileSync(filePath, String(content), 'utf8');
      } else {
        fs.writeFileSync(filePath, String(content), 'utf8');
      }

      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, filePath), mode, bytes: Buffer.byteLength(String(content), 'utf8') }
      };
    }

    case 'read_file': {
      const filePath = resolveWorkspacePath(parameters.path);
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, filePath), content }
      };
    }

    case 'list_directory': {
      const dirPath = resolveWorkspacePath(parameters.path || '.');
      const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }));

      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, dirPath) || '.', entries }
      };
    }

    case 'delete_file': {
      const filePath = resolveWorkspacePath(parameters.path);
      fs.unlinkSync(filePath);
      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, filePath), deleted: true }
      };
    }

    case 'execute_command': {
      const command = parameters.command;
      if (!command || typeof command !== 'string') {
        throw new Error("Le paramètre 'command' est requis.");
      }

      const result = execSync(command, {
        cwd: WORKSPACE_PATH,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return {
        success: true,
        tool,
        result: { command, output: result }
      };
    }

    default:
      throw new Error(`Outil non supporté: ${tool}`);
  }
}

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

// Warm-up: pre-spawn a cline process at startup so the first request is faster
function warmupCline() {
  fs.mkdirSync(WORKSPACE_PATH, { recursive: true });
  const warmup = spawn(CLINE_BIN, ['task', 'ping', '--config', CLINE_CONFIG, '--yolo', '--json'], {
    cwd: WORKSPACE_PATH,
    timeout: 30000,
    env: { HOME: process.env.HOME, PATH: process.env.PATH, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY },
  });
  warmup.on('close', () => console.log('✅ Cline warm-up done'));
  warmup.on('error', () => { }); // ignore errors silently
}

// Auto-configure Cline on startup
function setupCline() {
  const clineDir = path.join(WORKSPACE_PATH, '.cline', 'data');
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
    planModeApiProvider: "deepseek",
    planModeDeepSeekModelId: "deepseek-chat",
    mode: "act",
    autoApprovalSettings: {
      version: 22,
      enabled: true,
      maxRequests: 1,
      actions: {
        readFiles: true,
        editFiles: true,
        executeSafeCommands: true,
        useBrowser: true,
        useMcp: true
      }
    },
    mcpEnabled: true,
    browserToolEnabled: true
  }, null, 2));

  console.log('✅ Cline configured automatically');
}

// Stocke le dernier taskId par session utilisateur pour réutiliser la session Cline
const sessionTaskIds = new Map();

setupCline();
warmupCline();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/tools', (req, res) => {
  try {
    const { tool, parameters } = req.body || {};
    const output = runFileTool(tool, parameters);
    return res.json(output);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Tool execution failed',
    });
  }
});

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

    // OpenClaw-compatible direct tool execution:
    // send a JSON message like:
    // {"tool":"create_file","parameters":{"path":"todo.txt","content":"hello","mode":"write"}}
    const trimmedMessage = typeof userMessage === 'string' ? userMessage.trim() : '';
    if (trimmedMessage.startsWith('{') && trimmedMessage.endsWith('}')) {
      try {
        const parsedToolCall = JSON.parse(trimmedMessage);
        if (parsedToolCall.tool) {
          const toolResult = runFileTool(parsedToolCall.tool, parsedToolCall.parameters || {});
          return res.json({
            role: 'assistant',
            type: 'tool_result',
            ...toolResult,
          });
        }
      } catch (e) {
        // Not a valid tool call, continue to Cline flow
      }
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Env filtré : uniquement ce dont Cline a besoin, pas les secrets du serveur
    const clineEnv = {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      NODE_ENV: process.env.NODE_ENV,
    };

    // Réutiliser la session Cline existante si disponible (évite de recharger tout depuis zéro)
    const existingTaskId = sessionId ? sessionTaskIds.get(sessionId) : null;
    const clineArgs = [
      'task',
      userMessage,
      '--act',
      '--config', CLINE_CONFIG,
      '--model', 'deepseek/deepseek-chat',
      '--yolo',
      '--timeout', '60',
      '--json',
    ];
    if (existingTaskId) {
      clineArgs.push('--taskId', existingTaskId);
      console.log('[API] Resuming Cline session:', existingTaskId);
    }

    const cline = spawn(CLINE_BIN, clineArgs, {
      cwd: WORKSPACE_PATH,
      env: clineEnv,
    });

    let stdoutBuffer = '';
    let capturedTaskId = null;

    // Helper to parse and dispatch a single JSON event line
    function processEvent(line) {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);

        // Capturer le taskId dès qu'il apparaît pour réutiliser la session
        if (!capturedTaskId && event.taskId) {
          capturedTaskId = event.taskId;
          if (sessionId) sessionTaskIds.set(sessionId, capturedTaskId);
          console.log('[API] Captured taskId:', capturedTaskId);
        }
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
