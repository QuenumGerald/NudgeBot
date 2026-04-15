import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db';
import { scheduleNotificationJob } from '../lib/notifications';
import { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const createNotificationSchema = z.object({
  recipient_email: z.string().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  send_at: z.string().datetime(),
  recurrence_interval_minutes: z.number().int().min(1).max(525600).optional(),
  max_runs: z.number().int().min(1).max(10000).optional(),
});

router.post('/:userId', async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  if (req.user?.id !== Number(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsedBody = createNotificationSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsedBody.error.flatten() });
    return;
  }

  if (parsedBody.data.max_runs && !parsedBody.data.recurrence_interval_minutes) {
    res.status(400).json({ error: 'max_runs requires recurrence_interval_minutes' });
    return;
  }

  const sendAt = new Date(parsedBody.data.send_at);
  if (Number.isNaN(sendAt.getTime())) {
    res.status(400).json({ error: 'Invalid send_at date' });
    return;
  }

  if (sendAt.getTime() <= Date.now()) {
    res.status(400).json({ error: 'send_at must be in the future' });
    return;
  }

  try {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO scheduled_notifications (
        user_id,
        recipient_email,
        subject,
        body,
        send_at,
        status,
        recurrence_interval_minutes,
        max_runs
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      userId,
      parsedBody.data.recipient_email,
      parsedBody.data.subject,
      parsedBody.data.body,
      sendAt.toISOString(),
      parsedBody.data.recurrence_interval_minutes ?? null,
      parsedBody.data.max_runs ?? null
    );

    await scheduleNotificationJob(result.lastID as number, sendAt);

    const created = await db.get(
      `SELECT id, user_id, recipient_email, subject, body, send_at, sent_at, status, last_error,
              recurrence_interval_minutes, max_runs, run_count, last_sent_at, created_at
       FROM scheduled_notifications
       WHERE id = ?`,
      result.lastID
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:userId', async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  if (req.user?.id !== Number(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const db = await getDb();
    const notifications = await db.all(
      `SELECT id, user_id, recipient_email, subject, body, send_at, sent_at, status, last_error,
              recurrence_interval_minutes, max_runs, run_count, last_sent_at, created_at
       FROM scheduled_notifications
       WHERE user_id = ?
       ORDER BY datetime(send_at) DESC`,
      userId
    );
    res.json(notifications);
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
