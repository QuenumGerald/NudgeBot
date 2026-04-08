import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { settingsRouter } from "./routes/settings.js";
import { initDb } from "./lib/db.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initDb();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "nudgebot.sid",
    secret: process.env.SESSION_SECRET ?? "change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/settings", settingsRouter);

const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

const server = app.listen(port, () => {
  console.log(`NudgeBot server listening on http://localhost:${port}`);
});

const shutdown = (signal: NodeJS.Signals): void => {
  console.log(`Received ${signal}. Shutting down gracefully.`);
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
