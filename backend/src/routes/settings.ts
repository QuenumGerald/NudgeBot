import { Router } from 'express';
import { getDb } from '../lib/db';
import { invalidateMCPCache } from '../lib/agent/mcp';

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

    res.json({
      ...settings,
      enabled_integrations: settings.enabled_integrations
        ? JSON.parse(settings.enabled_integrations)
        : [],
    });
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { llm_provider, llm_model, llm_api_key, enabled_integrations } = req.body;

  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM settings WHERE user_id = ?', userId);

    const integrationsJson = Array.isArray(enabled_integrations)
      ? JSON.stringify(enabled_integrations)
      : existing?.enabled_integrations ?? '[]';

    if (existing) {
      await db.run(
        `UPDATE settings
         SET llm_provider = ?, llm_model = ?, llm_api_key = ?, enabled_integrations = ?
         WHERE user_id = ?`,
        llm_provider ?? existing.llm_provider,
        llm_model ?? existing.llm_model,
        llm_api_key ?? existing.llm_api_key,
        integrationsJson,
        userId
      );
    } else {
      await db.run(
        `INSERT INTO settings (user_id, llm_provider, llm_model, llm_api_key, enabled_integrations)
         VALUES (?, ?, ?, ?, ?)`,
        userId, llm_provider, llm_model, llm_api_key, integrationsJson
      );
    }

    // Invalidate MCP cache so next request picks up the new integrations
    invalidateMCPCache(userId);

    const updatedSettings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId);
    res.json({
      ...updatedSettings,
      enabled_integrations: updatedSettings?.enabled_integrations
        ? JSON.parse(updatedSettings.enabled_integrations)
        : [],
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
