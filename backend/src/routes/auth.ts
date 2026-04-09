import { Router } from 'express';
import { getDb } from '../lib/db';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);

    // Simple check for demo purposes
    if (!user || user.password_hash !== password) {
       res.status(401).json({ error: 'Invalid credentials' });
       return;
    }

    res.json({ message: 'Login successful', user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
