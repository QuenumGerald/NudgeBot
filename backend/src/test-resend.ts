import dotenv from 'dotenv';
dotenv.config();

const sendEmail = async (recipientEmail: string, subject: string, body: string) => {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();
  console.log("Using API key:", apiKey ? "Configured (ends with " + apiKey.slice(-6) + ")" : "Not configured");
  console.log("Using From Email:", fromEmail);

  if (!apiKey || !fromEmail) throw new Error("RESEND_API_KEY or RESEND_FROM_EMAIL not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject,
      html: `<div>${body.replace(/\n/g, "<br />")}</div>`,
      text: body,
    }),
  });
  console.log("Response status:", res.status);
  const text = await res.text();
  console.log("Response text:", text);
};

sendEmail("test@deepconnect.fr", "Test from NudgeBot", "Hello, testing Resend email sending!")
  .then(() => console.log("Done!"))
  .catch(console.error);
