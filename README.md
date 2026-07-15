# 🐝 NudgeBot — Personal AI Assistant

<p align="center">
  <img src="NudgeBot Logo.png" alt="NudgeBot logo" width="220">
</p>

<p align="center">
  <strong>A self-hosted AI assistant that remembers useful context without wasting tokens.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20%2B-brightgreen?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://github.com/QuenumGerald/NudgeBot"><img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://www.linkedin.com/in/g%C3%A9rald-quenum-00b965233"><img src="https://img.shields.io/badge/LinkedIn-G%C3%A9rald%20Quenum-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn profile"></a>
</p>

NudgeBot is a personal AI assistant built with React and Express. It keeps a compressed memory of your conversations, can store data locally, sync to a private GitHub repository, or use Neon Postgres, and lets you connect tools only when you need them.

## What it does

- **Persistent memory:** summarizes past chats so the assistant can remember important context while keeping token usage low.
- **Flexible storage:** use local JSON, private GitHub sync, or Neon Postgres with migration support and automatic pruning.
- **On-demand MCP tools:** connect services like Jira, Confluence, Google Calendar, GitHub, Netlify, or Render from settings.
- **Coding delegation:** send programming tasks to Google Jules for supported GitHub workflows.
- **Email reminders:** schedule one-time or recurring reminder emails with Resend.

## Quick start

**macOS / Linux**

```bash
git clone https://github.com/QuenumGerald/NudgeBot
cd NudgeBot
./install.sh
npm run dev
```

**Windows PowerShell**

```powershell
git clone https://github.com/QuenumGerald/NudgeBot
cd NudgeBot
.\install.ps1
npm run dev
```

Open `http://localhost:3000` after the server starts.

## Main environment variables

Create or update `backend/.env`:

```env
ADMIN_PASSWORD=your-admin-password
JWT_SECRET=your-secure-jwt-secret

LLM_PROVIDER=deepseek      # deepseek, openai, or openrouter
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=your-api-key

DATABASE_URL=              # optional Neon Postgres connection string
DISABLE_DB_PRUNING=false

JULES_API_KEY=             # optional Google Jules integration
RESEND_API_KEY=            # optional email reminders
RESEND_FROM_EMAIL=notifications@your-domain.com
GITHUB_TOKEN=              # optional private GitHub sync
```

## Useful commands

```bash
npm run dev              # start the app in development
npm run build            # build frontend and backend
npm start                # run the compiled backend
npm run uninstall        # remove generated local data and dependencies
```

For architecture and deployment details, see `ARCHITECTURE.md`.
