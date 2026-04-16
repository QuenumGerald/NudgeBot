import { BlazeJob } from 'blazerjob';
import { getStore, NotificationRecord } from './githubStore.js';

const jobs = new BlazeJob({ concurrency: 16 });
const scheduledNotificationIds = new Set<number>();
let workerStarted = false;

const getResendConfig = () => {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  return { apiKey, fromEmail };
};

const sendResendEmail = async (notification: NotificationRecord) => {
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
  const store = await getStore();
  const notification = store.getNotification(notificationId);

  if (!notification || notification.sent_at !== null || notification.status !== 'pending') {
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

      await store.updateNotification(notificationId, {
        run_count: nextRunCount,
        last_sent_at: new Date().toISOString(),
        send_at: nextRunAt.toISOString(),
        status: 'pending',
        last_error: null,
      });

      scheduleNotificationExecution(notificationId, nextRunAt);
      return;
    }

    await store.updateNotification(notificationId, {
      sent_at: new Date().toISOString(),
      last_sent_at: new Date().toISOString(),
      run_count: nextRunCount,
      status: 'sent',
      last_error: null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sending error';
    await store.updateNotification(notificationId, {
      status: 'failed',
      last_error: errorMessage,
    });
    console.error('[notifications] Failed to send', {
      notificationId,
      error: errorMessage,
    });
  }
};

const reconcilePendingNotifications = async () => {
  const store = await getStore();
  const pending = store.getPendingNotifications();

  for (const notification of pending) {
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
