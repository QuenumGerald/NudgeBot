const express = require('express');
const cors = require('cors');
const next = require('next');
require('dotenv').config();

const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');

const dev = process.env.NODE_ENV !== 'production';
const API_ONLY = process.env.API_ONLY === 'true';
const PORT = process.env.PORT || 3000;

const nextApp = !API_ONLY ? next({ dev, dir: process.cwd() }) : null;
const handle = nextApp ? nextApp.getRequestHandler() : null;

const app = express();

process.on('uncaughtException', (err) => console.error('[FATAL] Uncaught exception:', err));
process.on('unhandledRejection', (reason) => console.error('[FATAL] Unhandled rejection:', reason));
setInterval(() => { }, 1000 * 60 * 60);

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use(express.static('public'));

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

if (API_ONLY) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 NudgeBot API STANDALONE running on port ${PORT}`);
    console.log(`📝 Default model: ${process.env.DEFAULT_MODEL || 'deepseek/deepseek-chat'}`);
  });
  server.on('error', (err) => console.error('[SERVER] Error:', err));
} else {
  nextApp.prepare()
    .then(() => {
      app.use(async (req, res) => {
        try { await handle(req, res); }
        catch (err) {
          console.error('[Next.js] Request error:', err);
          res.status(500).end('Internal Server Error');
        }
      });
      const server = app.listen(PORT, () => console.log(`✅ NudgeBot running on http://localhost:${PORT}`));
      server.on('error', (err) => console.error('[SERVER] Error:', err));
    })
    .catch((err) => {
      console.error('[Next.js] Failed to prepare:', err);
      app.listen(PORT, () => console.log(`⚠️  NudgeBot API-Safe (port ${PORT})`));
    });
}
