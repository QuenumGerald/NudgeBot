import { Router } from 'express';
import { getDb } from '../lib/db';

const router = Router();

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const db = await getDb();
    const settings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId);

    if (!settings) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }
    res.json(settings);
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { llm_provider, llm_model, llm_api_key } = req.body;

  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM settings WHERE user_id = ?', userId);

    if (existing) {
      await db.run(
        'UPDATE settings SET llm_provider = ?, llm_model = ?, llm_api_key = ? WHERE user_id = ?',
        llm_provider, llm_model, llm_api_key, userId
      );
    } else {
      await db.run(
        'INSERT INTO settings (user_id, llm_provider, llm_model, llm_api_key) VALUES (?, ?, ?, ?)',
        userId, llm_provider, llm_model, llm_api_key
      );
    }

    const updatedSettings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId);
    res.json(updatedSettings);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
