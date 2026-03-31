const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    actModeApiProvider: "openrouter",
    actModeOpenRouterModelId: "deepseek/deepseek-chat",
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

    // Call Cline CLI task
    const cline = spawn('npx', [
      'cline',
      'task',
      userMessage,
      '--config', path.join(process.cwd(), 'data', '.cline'),
      '--yolo', // Auto-approve actions as configured in globalState
      '--auto-condense' // Enable context compression for large tasks
    ]);

    cline.stdout.on('data', (data) => {
      const content = data.toString();
      res.write(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`);
    });

    cline.stderr.on('data', (data) => {
      console.error(`[Cline Error] ${data}`);
    });

    cline.on('close', (code) => {
      console.log(`[API] Cline process closed with code: ${code}`);
      res.write(`data: ${JSON.stringify({ type: 'done', model: 'cline-cli' })}\n\n`);
      res.end();
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Simple HTML page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NudgeBot - Chat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #1a1a1a;
      padding: 1rem 2rem;
      border-bottom: 1px solid #333;
    }
    .header h1 {
      font-size: 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .message {
      max-width: 70%;
      padding: 1rem;
      border-radius: 1rem;
      line-height: 1.5;
    }
    .user {
      align-self: flex-end;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .assistant {
      align-self: flex-start;
      background: #1a1a1a;
      border: 1px solid #333;
    }
    .input-container {
      padding: 1.5rem 2rem;
      background: #1a1a1a;
      border-top: 1px solid #333;
      display: flex;
      gap: 1rem;
    }
    #messageInput {
      flex: 1;
      padding: 1rem;
      background: #0f0f0f;
      border: 1px solid #333;
      border-radius: 0.5rem;
      color: #e0e0e0;
      font-size: 1rem;
      resize: none;
    }
    #sendButton {
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    #sendButton:hover:not(:disabled) { opacity: 0.9; }
    #sendButton:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .loading {
      color: #667eea;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 NudgeBot</h1>
  </div>
  <div class="chat-container" id="chatContainer"></div>
  <div class="input-container">
    <textarea id="messageInput" placeholder="Type a message..." rows="1"></textarea>
    <button id="sendButton">Send</button>
  </div>

  <script>
    const chatContainer = document.getElementById('chatContainer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = \`message \${role}\`;
      div.textContent = content;
      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return div;
    }

    async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      addMessage('user', message);
      messageInput.value = '';
      sendButton.disabled = true;

      const assistantDiv = addMessage('assistant', '');
      let fullResponse = '';

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: message }],
            model: 'qwen/qwen3.6-plus-preview:free'
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const event = JSON.parse(data);
                if (event.type === 'delta') {
                  fullResponse += event.content;
                  assistantDiv.textContent = fullResponse;
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                }
              } catch (e) {}
            }
          }
        }
      } catch (error) {
        assistantDiv.textContent = 'Error: ' + error.message;
        assistantDiv.style.color = '#ff6b6b';
      }

      sendButton.disabled = false;
      messageInput.focus();
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.focus();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ NudgeBot server running on http://localhost:${PORT}`);
  console.log(`📝 Model: ${process.env.DEFAULT_MODEL || 'qwen/qwen3.6-plus-preview:free'}`);
});
