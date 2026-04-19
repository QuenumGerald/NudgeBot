import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
}

/**
 * Sends an email using either SMTP (via nodemailer) or Resend API as a fallback.
 * SMTP takes precedence if configured.
 */
export async function sendEmail({ to, subject, body, html }: SendEmailOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = parseInt(process.env.SMTP_PORT?.trim() || "0", 10);
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpFrom = process.env.SMTP_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim();

  // SMTP Configuration (Primary)
  if (smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const toAddresses = Array.isArray(to) ? to.join(", ") : to;

    await transporter.sendMail({
      from: smtpFrom,
      to: toAddresses,
      subject,
      text: body,
      html: html || `<div>${body.replace(/\n/g, "<br />")}</div>`,
    });

    return;
  }

  // Resend Configuration (Fallback)
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim();

  if (resendApiKey && resendFromEmail) {
    const toAddresses = Array.isArray(to) ? to : [to];

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: toAddresses,
        subject,
        html: html || `<div>${body.replace(/\n/g, "<br />")}</div>`,
        text: body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error (${response.status}): ${errorText}`);
    }

    return;
  }

  throw new Error("Email is not configured. Set SMTP_* or RESEND_* environment variables.");
}
