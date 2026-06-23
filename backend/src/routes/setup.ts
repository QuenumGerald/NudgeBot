import { Router } from 'express';
import fs from 'fs';
import { getStore } from '../lib/githubStore.js';

const router = Router();

// Helper to update or append keys in a .env file
function updateEnvFile(filePath: string, updates: Record<string, string>) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }

  const lines = content.split('\n');
  const updatedKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      if (key in updates) {
        lines[i] = `${key}=${updates[key]}`;
        updatedKeys.add(key);
      }
    }
  }

  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      lines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

router.get('/status', (req, res) => {
  try {
    const envFilePath = process.env.NUDGEBOT_ENV_PATH;
    let isCompleted = process.env.SETUP_COMPLETED === 'true';

    // If env variable is not explicitly true, double check file content if path is defined
    if (!isCompleted && envFilePath && fs.existsSync(envFilePath)) {
      const fileContent = fs.readFileSync(envFilePath, 'utf8');
      if (fileContent.includes('SETUP_COMPLETED=true')) {
        isCompleted = true;
        process.env.SETUP_COMPLETED = 'true';
      }
    }

    res.json({ needsSetup: !isCompleted });
  } catch (error) {
    console.error('[setup] Status check error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

router.post('/config', async (req, res) => {
  try {
    const { adminPassword, llmProvider, llmModel, llmApiKey } = req.body;

    if (!adminPassword || adminPassword.trim().length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters long' });
      return;
    }

    if (!llmProvider || !llmApiKey) {
      res.status(400).json({ error: 'LLM Provider and API key are required' });
      return;
    }

    const envFilePath = process.env.NUDGEBOT_ENV_PATH;
    const updates: Record<string, string> = {
      ADMIN_PASSWORD: adminPassword,
      LLM_PROVIDER: llmProvider,
      LLM_MODEL: llmModel || '',
      SETUP_COMPLETED: 'true'
    };

    if (llmProvider === 'openai') {
      updates.OPENAI_API_KEY = llmApiKey;
    } else if (llmProvider === 'deepseek') {
      updates.DEEPSEEK_API_KEY = llmApiKey;
    } else if (llmProvider === 'openrouter') {
      updates.OPENROUTER_API_KEY = llmApiKey;
    }

    // Write to file if path is defined
    if (envFilePath) {
      console.log(`[setup] Writing updates to env file: ${envFilePath}`);
      updateEnvFile(envFilePath, updates);
    }

    // Apply to current process.env instantly
    Object.assign(process.env, updates);

    // Save configuration settings in the database for user 1 (admin)
    try {
      const store = await getStore();
      await store.upsertSettings(1, {
        llm_provider: llmProvider,
        llm_model: llmModel || '',
      });
      console.log('[setup] Successfully updated non-sensitive database settings for admin');
    } catch (dbError) {
      console.error('[setup] Warning: failed to save to database settings:', dbError);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[setup] Config save error:', error);
    res.status(500).json({ error: 'Failed to save setup configuration' });
  }
});

export default router;
