import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { getDb } from './lib/db';

dotenv.config();

import authRouter from './routes/auth';
import settingsRouter from './routes/settings';
import chatRouter from './routes/chat';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

getDb().catch(console.error);

app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/chat', chatRouter);

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
