import { Router } from "express";
import { getSessionManager } from "../lib/renderSessionManager";

const router = Router();

// GET /api/memory/:userId — current context stats + content
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const sm = getSessionManager();
    await sm.loadUserSession(userId);
    const stats = sm.getSessionStats(userId);
    const summary = sm.getContextSummaryForPrompt(userId);

    // Expose individual sections for the UI
    const session = (sm as any).sessions?.get(userId);
    const ctx = session?.context ?? {};

    res.json({
      stats,
      summary,
      sections: {
        decisions: ctx.key_decisions ?? [],
        actions: ctx.next_actions ?? [],
        topics: ctx.active_topics ?? [],
        messageCount: (ctx.messages ?? []).length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory/:userId/:section — clear one section
router.delete("/:userId/:section", async (req, res) => {
  const { userId, section } = req.params;
  const validSections = ["decisions", "actions", "topics", "messages"] as const;

  if (!validSections.includes(section as any)) {
    res.status(400).json({ error: `Invalid section. Valid: ${validSections.join(", ")}` });
    return;
  }

  try {
    const sm = getSessionManager();
    await sm.loadUserSession(userId);
    sm.clearSection(userId, section as typeof validSections[number]);

    // Persist immediately
    await sm.saveUserSession(userId, true).catch(console.error);

    res.json({ ok: true, cleared: section });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory/:userId — clear everything
router.delete("/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const sm = getSessionManager();
    sm.clearAll(userId);
    // Persist the empty state
    await sm.saveUserSession(userId, true).catch(console.error);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memory/:userId/save — force save to GitHub
router.post("/:userId/save", async (req, res) => {
  const { userId } = req.params;
  try {
    const sm = getSessionManager();
    const ok = await sm.saveUserSession(userId, true);
    res.json({ ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
