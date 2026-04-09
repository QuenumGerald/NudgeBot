import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../lib/db';

const router = Router();

// Define session interface augmentation
declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      // Simulate registering first user if DB is empty for demo purposes
      const userCount: any = db.prepare('SELECT COUNT(*) as count FROM users').get();
      if (userCount.count === 0) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hashedPassword);
        req.session.userId = result.lastInsertRowid as number;
        res.json({ message: 'User registered and logged in', userId: req.session.userId });
        return;
      }
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    req.session.userId = user.id;
    res.json({ message: 'Logged in successfully', userId: user.id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Could not log out' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

router.get('/me', (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
