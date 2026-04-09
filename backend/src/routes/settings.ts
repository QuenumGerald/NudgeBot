import { Router, Request, Response } from 'express';
import { db } from '../lib/db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const settings = db.prepare('SELECT llm_provider, llm_model, llm_api_key FROM settings WHERE user_id = ?').get(req.session.userId);
    res.json(settings || { llm_provider: 'openrouter', llm_model: 'deepseek/deepseek-chat', llm_api_key: '' });
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { llm_provider, llm_model, llm_api_key } = req.body;

  try {
    const existing = db.prepare('SELECT id FROM settings WHERE user_id = ?').get(req.session.userId);

    if (existing) {
      db.prepare('UPDATE settings SET llm_provider = ?, llm_model = ?, llm_api_key = ? WHERE user_id = ?')
        .run(llm_provider, llm_model, llm_api_key, req.session.userId);
    } else {
      db.prepare('INSERT INTO settings (user_id, llm_provider, llm_model, llm_api_key) VALUES (?, ?, ?, ?)')
        .run(req.session.userId, llm_provider, llm_model, llm_api_key);
    }

    res.json({ message: 'Settings saved' });
  } catch (error) {
    console.error('Settings save error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
