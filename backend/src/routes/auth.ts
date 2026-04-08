import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../lib/db.js";

const loginSchema = z.object({
  email: z.string().email().default("admin@nudgebot.local"),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const password = parsed.password;
    const email = parsed.email;

    const user = db
      .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; password_hash: string } | undefined;

    if (!user) {
      const hash = await bcrypt.hash(process.env.APP_PASSWORD ?? "changeme", 10);
      const created = db
        .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
        .run(email, hash);

      db.prepare(
        "INSERT OR IGNORE INTO settings (user_id, llm_provider, llm_model, llm_api_key) VALUES (?, ?, ?, ?)"
      ).run(
        Number(created.lastInsertRowid),
        process.env.DEFAULT_LLM_PROVIDER ?? "openrouter",
        process.env.DEFAULT_LLM_MODEL ?? "deepseek/deepseek-chat",
        process.env.OPENROUTER_API_KEY ?? ""
      );
    }

    const account = db
      .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; password_hash: string } | undefined;

    if (!account) {
      res.status(500).json({ error: "Failed to load account." });
      return;
    }

    const ok = await bcrypt.compare(password, account.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    req.session.user = { id: account.id, email: account.email };
    res.json({ user: req.session.user });
  } catch (error) {
    res.status(400).json({ error: "Invalid login payload." });
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({ error: "Could not logout." });
      return;
    }
    res.clearCookie("nudgebot.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/session", (req, res) => {
  res.json({ user: req.session.user ?? null });
});
