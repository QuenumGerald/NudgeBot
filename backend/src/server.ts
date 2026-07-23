import { isPolyfilled } from './polyfill.js';
if (!isPolyfilled) console.log('[polyfill] failed');
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getStore, getStoreSync } from './lib/githubStore.js';
import { requireAuth } from './middleware/auth.js';

dotenv.config();

import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import settingsRouter from './routes/settings.js';
import notificationsRouter from './routes/notifications.js';
import { startNotificationWorker } from './lib/notifications.js';
import { initGitHubContextManager, flushGitHubContextManagers } from './lib/githubContextManager.js';
import setupRouter from './routes/setup.js';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  })
);
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize store and GitHub context manager before accepting requests.
const serverReady = getStore()
  .then(async () => {
    console.log('[store] initialized');
    await initGitHubContextManager();
    console.log('[github-ctx] initialized');
    startNotificationWorker();
  })
  .catch((err) => {
    console.error('[server] startup initialization failed:', err);
    throw err;
  });

app.use('/api/setup', setupRouter);
app.use('/api/auth', authRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);

const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

app.get(/^(?!\/api).+/, (req: Request, res: Response) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Flush store to GitHub on shutdown
const shutdown = async () => {
  const store = getStoreSync();
  if (store) {
    console.log('[store] flushing to GitHub before exit...');
    await store.flush();
  }
  try {
    await flushGitHubContextManagers();
  } catch (err) {
    console.error('[server] error flushing context managers on exit:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

serverReady.then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(() => {
  process.exit(1);
});
