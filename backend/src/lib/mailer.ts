import nodemailer from 'nodemailer';

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const getResendConfig = () => {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  return { apiKey, fromEmail };
};

const sendWithResend = async (payload: EmailPayload) => {
  const { apiKey, fromEmail } = getResendConfig();

  if (!apiKey || !fromEmail) {
    throw new Error('Email not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html || `<div>${payload.text.replace(/\n/g, '<br />')}</div>`,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email via Resend (${response.status}): ${errorText}`);
  }

  return `Email sent to ${payload.to} with subject "${payload.subject}".`;
};

const sendWithSMTP = async (payload: EmailPayload) => {
  const host = (process.env.SMTP_HOST || '').trim();
  const portStr = (process.env.SMTP_PORT || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM || '').trim(); // Fallback to RESEND_FROM_EMAIL for from address

  if (!host || !portStr || !user || !pass || !fromEmail) {
    throw new Error('SMTP not fully configured');
  }

  const port = parseInt(portStr, 10);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: fromEmail,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html || `<div>${payload.text.replace(/\n/g, '<br />')}</div>`,
  });

  return `Email sent to ${payload.to} with subject "${payload.subject}".`;
};

export const sendEmail = async (payload: EmailPayload) => {
  try {
    // Try SMTP first if configured
    return await sendWithSMTP(payload);
  } catch (smtpError) {
    console.warn('[mailer] SMTP failed or not configured, falling back to Resend:', smtpError);
    // Fallback to Resend
    return await sendWithResend(payload);
  }
};
