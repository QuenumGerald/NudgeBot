import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";

const settingsSchema = z.object({
  llmProvider: z.string().min(1),
  llmModel: z.string().min(1),
  llmApiKey: z.string().optional().default("")
});

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/", (req, res) => {
  try {
    const settings = db
      .prepare("SELECT llm_provider, llm_model, llm_api_key FROM settings WHERE user_id = ?")
      .get(req.session.user!.id);
    res.json({ settings });
  } catch {
    res.status(500).json({ error: "Failed to load settings." });
  }
});

settingsRouter.post("/", (req, res) => {
  try {
    const parsed = settingsSchema.parse(req.body);
    db.prepare(
      `INSERT INTO settings (user_id, llm_provider, llm_model, llm_api_key)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET llm_provider=excluded.llm_provider, llm_model=excluded.llm_model, llm_api_key=excluded.llm_api_key`
    ).run(req.session.user!.id, parsed.llmProvider, parsed.llmModel, parsed.llmApiKey);

    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Invalid settings payload." });
  }
});
