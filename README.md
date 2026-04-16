# 🐝 NudgeBot — Personal AI Assistant

<p align="center">
  <img src="NudgeBot Logo.png" alt="NudgeBot" width="220">
</p>

<p align="center">
  <strong>The assistant that actually remembers you — without burning your token budget.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20%2B-brightgreen?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://github.com/QuenumGerald/NudgeBot"><img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/QuenumGerald/NudgeBot"><img src="https://img.shields.io/badge/LangGraph-agent-purple?style=for-the-badge" alt="LangGraph"></a>
</p>

---

NudgeBot is a **self-hosted AI assistant** (React + Express) built around one core idea: **your conversation history belongs to you and shouldn't cost you a fortune in tokens.**

While other assistants like OpenClaw re-inject the full conversation history into every request — leading to exponentially growing token costs — NudgeBot **compresses and stores context on GitHub**, then injects only a concise summary into the system prompt. No vector databases, no paid cloud services, no token floods.

---

## Why NudgeBot vs. other self-hosted assistants?

| Feature | NudgeBot | OpenClaw / typical assistants |
|---|---|---|
| **Cross-session memory** | ✅ GitHub-backed, compressed | ❌ In-memory only, lost on restart |
| **Token efficiency** | ✅ Compact summary injected once | ❌ Full history re-sent every request |
| **Memory storage** | ✅ Private GitHub repo (free, versioned) | ❌ Local files, no history, no versioning |
| **GitHub context manager** | ✅ First-class, auto-creates repo | ❌ Not available |
| **On-demand MCP servers** | ✅ Per-user, lazy start | ⚠️ Global startup (slower, noisy) |
| **Google Jules integration** | ✅ Delegate coding tasks + auto PR | ❌ Not available |
| **Email notifications** | ✅ Resend + recurring schedule | ❌ Not available |
| **Self-hosted** | ✅ One `npm start` | ✅ Yes |
| **Multi-channel (WhatsApp, Slack…)** | ❌ Web only | ✅ Yes |

> NudgeBot trades multi-channel breadth for **deep GitHub integration and token frugality**. If you primarily use the web interface and care about memory without paying for it in tokens, NudgeBot is the better fit.

---

## Quick start

```bash
# Clone and install
git clone https://github.com/QuenumGerald/NudgeBot
cd NudgeBot
npm install

# Configure (see Variables section below)
cp backend/.env.example backend/.env

# Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Add the generated secret to backend/.env:
# JWT_SECRET=<generated-secret>
# JWT_EXPIRES_IN=12h

# Run
npm run dev
```

App available at `http://localhost:3000`.

**Login**: Use `POST /api/auth/login` with your `ADMIN_PASSWORD` to get a JWT token, then include it in requests with `Authorization: Bearer <token>`.

**Requirements:** Node.js 20+ · npm 10+

---

## Highlights

### 🧠 GitHub-backed memory — zero token waste

Most assistants either forget everything on restart, or re-inject the full history on every request (expensive). NudgeBot instead:

1. Summarizes each session into **key decisions + active actions + topics**
2. Stores the compressed context as JSON in a **private GitHub repo** (`nudgebot-context`)
3. On the next session, injects only the **compact summary** into the system prompt — not hundreds of messages

No third-party memory service. No vector DB. Just a GitHub repo you already have.

**Auto-creates the repo** if `GITHUB_CONTEXT_REPO` is not set — resolves your login via the GitHub API and creates `{login}/nudgebot-context` (private, auto-init).

---

### ⚡ LangGraph agent with tool use

The agent is a [LangGraph](https://langchain-ai.github.io/langgraphjs/) `StateGraph` that loops `LLM → tools → LLM` until no more tool calls are needed. Supported providers: **DeepSeek**, **OpenRouter**, **OpenAI** (configurable per user in Settings).

#### Built-in tools

| Tool | What it does |
|---|---|
| `create_project_workspace` | Creates a sandboxed subfolder per project under `NUDGEBOT_WORKDIR` |
| `read_file` | Reads a file (workspace-restricted) |
| `write_file` | Writes or overwrites a file |
| `list_directory` | Lists a directory |
| `delete_file` | Deletes a file or folder |
| `execute_command` | Runs a shell command in the workspace |
| `schedule_task` | Schedules a one-off or recurring task via node-cron |
| `list_tasks` | Lists active scheduled tasks |
| `cancel_task` | Cancels a task by ID |
| `run_jules_session` | Launches a Google Jules AI coding session |

---

### 🤖 Google Jules — delegate coding to an AI agent

NudgeBot can hand off development tasks to **Google Jules** (Google's AI coding agent). The `run_jules_session` tool:

- Takes a prompt, a GitHub repo (`owner/repo`) and a base branch
- Streams Jules's progress updates in real time
- Returns the **Pull Request URL** created automatically by Jules

```
User: "Add pagination to the /api/users endpoint in repo myorg/myapi"
NudgeBot: [runs Jules] → PR created: https://github.com/myorg/myapi/pull/42
```

Requires: `JULES_API_KEY` + `GITHUB_PERSONAL_ACCESS_TOKEN`

---

### 🔌 MCP integrations — on-demand, per user

MCP servers start **only when a user enables them** in Settings. No global startup, no credential errors for services you don't use.

| Integration | Tools exposed | Required env vars |
|---|---|---|
| **Web Fetch** | Fetch any URL | — |
| **GitHub** | Repos, issues, PRs, code search | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| **Google Calendar** | Read/create/update events | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| **Jira** | Tickets, sprints, projects | `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_URL` |
| **Confluence** | Pages, spaces, search | `CONFLUENCE_API_TOKEN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_URL` |
| **Render** | Deployments, services, logs | `RENDER_API_KEY` |
| **Netlify** | Sites, deploys, DNS | `NETLIFY_AUTH_TOKEN` |

Each user's enabled integrations are stored in SQLite. The MCP client is cached per `userId:integrations` key and invalidated on Settings change.

---

### 📧 Email notifications (Resend)

Schedule email notifications via `POST /api/notifications/:userId`:

```json
{
  "recipient_email": "you@example.com",
  "subject": "Daily standup reminder",
  "body": "Time for standup!",
  "send_at": "2026-04-17T09:00:00Z",
  "recurrence_interval_minutes": 1440,
  "max_runs": 30
}
```

- **One-off**: set `send_at`, omit `recurrence_interval_minutes`
- **Recurring**: add `recurrence_interval_minutes` (minutes between runs) + optional `max_runs`
- Worker reconciles pending notifications on startup (survives restarts)
- Powered by [Resend](https://resend.com)

---

### 🔒 Security

- **JWT** authentication on all `/api` routes (configurable expiry via `JWT_EXPIRES_IN`)
  - Login: `POST /api/auth/login` with `{ "password": "ADMIN_PASSWORD" }`
  - Returns: `{ "message": "Login successful", "user": { "id": 1, "email": "admin" }, "token": "jwt_token_here" }`
  - Use token in header: `Authorization: Bearer <token>`
  - Protected routes: `/api/chat`, `/api/settings`, `/api/notifications`
- **Helmet** — secure HTTP headers out of the box
- **Rate limiting** — 300 req/15min per IP by default (`RATE_LIMIT_MAX`)
- **Strict CORS** — only origins listed in `CORS_ORIGIN` are allowed
- **Path traversal protection** — all file tools are restricted to `NUDGEBOT_WORKDIR`
- **Per-user MCP isolation** — each user's integrations run in their own cached client

---

## Settings page

The Settings page lets each user configure:

- **LLM provider + model + API key** — overrides server env vars per user
- **MCP integrations** — toggle each service on/off with instant cache invalidation
- **Memory** — view stats (decisions, actions, topics, message count), delete individual sections, force-save to GitHub, or clear everything

---

## Environment variables

Create `backend/.env`:

```env
# Server
PORT=3000
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_MAX=300

# Auth
ADMIN_PASSWORD=your-admin-password
JWT_SECRET=your-long-random-secret
JWT_EXPIRES_IN=12h

# To generate a secure JWT_SECRET, run:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# This creates a 128-character hex string suitable for production use

# LLM (user can override in Settings)
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
OPENROUTER_API_KEY=
OPENAI_API_KEY=

# Database
DATABASE_URL=/data/nudgebot.sqlite

# Agent workspace
NUDGEBOT_WORKDIR=./workspace

# Google Jules
JULES_API_KEY=

# Email notifications
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@your-domain.com

# GitHub memory (cross-session context)
GITHUB_CONTEXT_TOKEN=          # GitHub PAT with repo scope
GITHUB_CONTEXT_REPO=           # e.g. mylogin/nudgebot-context (auto-created if blank)

# MCP: GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=

# MCP: Jira
JIRA_API_TOKEN=
JIRA_EMAIL=
JIRA_URL=

# MCP: Confluence
CONFLUENCE_API_TOKEN=
CONFLUENCE_EMAIL=
CONFLUENCE_URL=

# MCP: Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_SERVICE_ACCOUNT_JSON=   # optional, stringified JSON

# MCP: Render
RENDER_API_KEY=

# MCP: Netlify
NETLIFY_AUTH_TOKEN=
```

---

## Architecture

```
NudgeBot/
├── frontend/                  # React + Vite
│   └── src/pages/             # Home (chat), Settings
└── backend/
    └── src/
        ├── lib/
        │   ├── agent/
        │   │   ├── graph.ts              # LangGraph StateGraph
        │   │   ├── tools.ts              # File, shell, Jules, scheduling tools
        │   │   └── mcp.ts                # On-demand MCP, per-user cache
        │   ├── githubContextManager.ts   # GitHub persistence (read/write/auto-create)
        │   ├── renderSessionManager.ts   # In-memory sessions + hourly auto-save
        │   ├── notifications.ts          # Resend worker + recurrence logic
        │   └── db.ts                     # SQLite schema + migrations
        ├── routes/
        │   ├── auth.ts          # POST /api/auth/login|register
        │   ├── chat.ts          # POST /api/chat  (SSE stream)
        │   ├── settings.ts      # GET/POST /api/settings
        │   ├── notifications.ts # CRUD /api/notifications
        │   └── memory.ts        # GET/DELETE /api/memory/:userId/...
        ├── middleware/
        │   └── auth.ts          # requireAuth (JWT)
        └── server.ts
```

### Request flow

```
Browser → POST /api/chat  (JWT required)
  → Load user settings from SQLite (LLM config + enabled integrations)
  → Load compressed context from GitHub (previous sessions)
  → getAgent(provider, model, apiKey, integrations, userId, previousContext)
      → setupMCP(integrations, userId)   ← lazy, per-user, cached
      → LangGraph: LLM → tools → LLM → … → final answer
  → SSE: { type: "thinking" } → { type: "delta", content } → { type: "done" }
  → renderSessionManager.addMessage()
  → Auto-save to GitHub every hour (node-cron)
```

---

## Build for production

```bash
npm run build
npm start
```

Serves frontend static assets + API from a single Express process on `PORT`.

---

## Deploy on Render

### Prerequisites

- A Render account (free tier available)
- GitHub repository connected to Render

### Environment Variables

Set these in your Render dashboard:

```env
# Server
PORT=3000
CORS_ORIGIN=https://your-app.onrender.com
RATE_LIMIT_MAX=300

# Auth
ADMIN_PASSWORD=your-admin-password
JWT_SECRET=your-long-random-secret
JWT_EXPIRES_IN=12h

# LLM
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Database (Render provides disk persistence)
DATABASE_URL=/data/nudgebot.sqlite

# Agent workspace
NUDGEBOT_WORKDIR=/data/workspace

# GitHub memory (cross-session context)
GITHUB_CONTEXT_TOKEN=your-github-pat
GITHUB_CONTEXT_REPO=your-username/nudgebot-context

# MCP: GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=your-github-pat

# MCP integrations (optional)
JIRA_API_TOKEN=
JIRA_EMAIL=
JIRA_URL=
CONFLUENCE_API_TOKEN=
CONFLUENCE_EMAIL=
CONFLUENCE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
RENDER_API_KEY=
NETLIFY_AUTH_TOKEN=
```

### Build Command

```bash
cd frontend && npm install && npm run build && cd ../backend && npm install && npm run build
```

### Start Command

```bash
cd backend && npm start
```

### Notes

- Render uses ephemeral file systems — use `/data` for persistent storage
- GitHub context persistence is recommended for cross-session memory
- Set `GITHUB_CONTEXT_REPO` to avoid auto-creation on every deploy
- Free tier has spin-down after 15min inactivity — first request may be slow
