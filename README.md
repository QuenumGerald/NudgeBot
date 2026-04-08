# NudgeBot

Production-ready monorepo for an autonomous AI assistant built with:

- **Frontend:** React + Vite + TypeScript + React Router + Tailwind v4 + shadcn-inspired UI
- **Backend:** Node.js + Express + TypeScript + SQLite
- **AI Engine:** LangGraph + MCP adapters
- **Deploy:** Render via `render.yaml`

## Structure

```text
nudgebot/
├── backend/
├── frontend/
├── render.yaml
└── README.md
```

## Quick Start

### 1) Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

### 2) Run in development

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

### 3) Build for production

```bash
cd backend && npm run build && npm run start
```

This builds the frontend and copies static assets into `backend/public`.

## Authentication

Default login email: `admin@nudgebot.local`

Password defaults to `APP_PASSWORD` from `backend/.env` (default `changeme`).

## Chat Streaming Events

`/api/chat` streams SSE events:

- `thinking`
- `delta`
- `tool_start`
- `tool_result`
- `error`
- `done`

## Environment Variables

See `backend/.env` and `frontend/.env` for local defaults.
