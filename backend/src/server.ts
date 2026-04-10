import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { getDb } from './lib/db';
import { initGitHubContextManager } from './lib/githubContextManager';

dotenv.config();

import authRouter from './routes/auth';
import chatRouter from './routes/chat';
import settingsRouter from './routes/settings';
import memoryRouter from './routes/memory';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

getDb().catch(console.error);
initGitHubContextManager().catch(console.error);

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/memory', memoryRouter);

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
  // Ne pas quitter le processus
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Ne pas quitter le processus
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
