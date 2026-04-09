import { Router } from 'express';
import { getDb } from '../lib/db';

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    res.status(500).json({ error: 'Admin password not configured' });
    return;
  }

  if (password !== adminPassword) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  res.json({ message: 'Login successful', user: { id: 1, email: 'admin' } });
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
