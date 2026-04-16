import { Router } from 'express';
import { createAuthToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    console.log('[auth] login attempt', {
      hasPassword: Boolean(password),
      hasAdminPassword: Boolean(adminPassword),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
    });

    if (!adminPassword) {
      res.status(500).json({ error: 'Admin password not configured' });
      return;
    }

    if (password !== adminPassword) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const user = { id: 1, email: 'admin' };
    const token = createAuthToken(user);

    res.json({ message: 'Login successful', user, token });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
