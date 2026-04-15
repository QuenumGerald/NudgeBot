import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getDb } from './lib/db';
import { requireAuth } from './middleware/auth';

dotenv.config();

import authRouter from './routes/auth';
import chatRouter from './routes/chat';
import settingsRouter from './routes/settings';

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
app.use(express.json());

getDb().catch(console.error);

app.use('/api/auth', authRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/settings', requireAuth, settingsRouter);

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
