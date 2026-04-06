const { Router } = require('express');

const router = Router();

router.post('/login', (req, res) => {
  const appPassword = process.env.APP_PASSWORD;
  const appSecret = process.env.APP_SECRET;

  if (!appPassword || !appSecret) {
    return res.status(500).json({ ok: false, error: "Configuration serveur incorrecte" });
  }

  const { password, action } = req.body;

  if (action === "logout") {
    res.clearCookie("nudgebot-session");
    return res.json({ ok: true });
  }

  if (password === appPassword) {
    res.cookie("nudgebot-session", appSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  setTimeout(() => {
    res.status(401).json({ ok: false, error: "Mot de passe incorrect" });
  }, 500);
});

module.exports = router;
