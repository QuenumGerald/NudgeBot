import { BlazeJob } from 'blazerjob';
import { getDb } from './db';

type PendingNotification = {
  id: number;
  user_id: number;
  recipient_email: string;
  subject: string;
  body: string;
  send_at: string;
  recurrence_interval_minutes: number | null;
  max_runs: number | null;
  run_count: number;
};

const jobs = new BlazeJob({ concurrency: 16 });
const scheduledNotificationIds = new Set<number>();
let workerStarted = false;

const getResendConfig = () => {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  return { apiKey, fromEmail };
};

const sendResendEmail = async (notification: PendingNotification) => {
  const { apiKey, fromEmail } = getResendConfig();

  if (!apiKey || !fromEmail) {
    throw new Error('RESEND_API_KEY or RESEND_FROM_EMAIL is not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notification.recipient_email],
      subject: notification.subject,
      html: `<div>${notification.body.replace(/\n/g, '<br />')}</div>`,
      text: notification.body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }
};

const scheduleNotificationExecution = (notificationId: number, sendAt: Date) => {
  if (scheduledNotificationIds.has(notificationId)) {
    return;
  }

  scheduledNotificationIds.add(notificationId);

  jobs.schedule(
    async () => {
      await processNotificationById(notificationId);
    },
    {
      runAt: sendAt.getTime() <= Date.now() ? new Date() : sendAt,
      maxRuns: 1,
      onEnd: () => {
        scheduledNotificationIds.delete(notificationId);
      },
    }
  );
};

const processNotificationById = async (notificationId: number) => {
  const db = await getDb();
  const notification = await db.get<PendingNotification>(
    `SELECT id, user_id, recipient_email, subject, body, send_at,
            recurrence_interval_minutes, max_runs, run_count
     FROM scheduled_notifications
     WHERE id = ? AND sent_at IS NULL AND status = 'pending'`,
    notificationId
  );

  if (!notification) {
    return;
  }

  try {
    await sendResendEmail(notification);

    const nextRunCount = notification.run_count + 1;
    const canRepeat = Boolean(notification.recurrence_interval_minutes)
      && (notification.max_runs == null || nextRunCount < notification.max_runs);

    if (canRepeat) {
      const intervalMs = (notification.recurrence_interval_minutes as number) * 60_000;
      const nextRunAt = new Date(Date.now() + intervalMs);

      await db.run(
        `UPDATE scheduled_notifications
         SET run_count = ?,
             last_sent_at = CURRENT_TIMESTAMP,
             send_at = ?,
             status = 'pending',
             last_error = NULL
         WHERE id = ?`,
        nextRunCount,
        nextRunAt.toISOString(),
        notification.id
      );

      scheduleNotificationExecution(notification.id, nextRunAt);
      return;
    }

    await db.run(
      `UPDATE scheduled_notifications
       SET sent_at = CURRENT_TIMESTAMP,
           last_sent_at = CURRENT_TIMESTAMP,
           run_count = ?,
           status = 'sent',
           last_error = NULL
       WHERE id = ?`,
      nextRunCount,
      notification.id
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sending error';
    await db.run(
      `UPDATE scheduled_notifications
       SET status = 'failed', last_error = ?
       WHERE id = ?`,
      errorMessage,
      notification.id
    );
    console.error('[notifications] Failed to send', {
      notificationId: notification.id,
      error: errorMessage,
    });
  }
};

const reconcilePendingNotifications = async () => {
  const db = await getDb();
  const pendingNotifications = await db.all<PendingNotification[]>(
    `SELECT id, user_id, recipient_email, subject, body, send_at,
            recurrence_interval_minutes, max_runs, run_count
     FROM scheduled_notifications
     WHERE sent_at IS NULL AND status = 'pending'`
  );

  for (const notification of pendingNotifications) {
    scheduleNotificationExecution(notification.id, new Date(notification.send_at));
  }
};

export const scheduleNotificationJob = async (notificationId: number, sendAt: Date) => {
  scheduleNotificationExecution(notificationId, sendAt);
};

export const startNotificationWorker = () => {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  jobs.schedule(
    async () => {
      await reconcilePendingNotifications();
    },
    {
      runAt: new Date(),
      interval: 60_000,
    }
  );
};
