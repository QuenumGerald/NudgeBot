import { Router } from 'express';
import { getStore } from '../lib/githubStore.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:userId', async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  if (req.user?.id !== Number(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const store = await getStore();
    const settings = store.getSettings(Number(userId));

    if (!settings) {
      res.json({
        user_id: Number(userId),
        llm_provider: null,
        llm_model: null,
        llm_api_key: null,
        enabled_integrations: '[]',
      });
      return;
    }
    res.json(settings);
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:userId', async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  const { llm_provider, llm_model, llm_api_key, enabled_integrations } = req.body;
  if (req.user?.id !== Number(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const store = await getStore();
    const updated = await store.upsertSettings(Number(userId), {
      llm_provider,
      llm_model,
      llm_api_key,
      enabled_integrations: enabled_integrations != null
        ? JSON.stringify(enabled_integrations)
        : undefined,
    });
    res.json(updated);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
