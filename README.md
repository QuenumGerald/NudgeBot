# Nudgebot

## Prerequisites
- Node 18+ and npm (install dependencies with `npm install`).
- Docker or Docker Compose if you want to run the database locally.
- Set `OPENROUTER_API_KEY` in your `.env` and optionally `DEFAULT_MODEL` (defaults to `minimax/minimax-m2.5:free`).

## Local development with Docker Compose
This repo already ships with `docker-compose.yml`. To bring everything up:

```bash
cp .env.example .env
# edit defaults (APP_PASSWORD, APP_SECRET, OPENROUTER_API_KEY, etc.)
docker compose up --build
```

That command starts PostgreSQL, the Next.js server (with `NODE_ENV=production`), and Nginx. The Postgres container listens on `postgres:5432`, so the Next.js service connects via `DATABASE_URL=postgres://user:password@postgres:5432/nudgebot?sslmode=disable` (Postgres in this stack does not accept SSL). The tables (`memories`, `sessions`, etc.) are created by the application at runtime.

If you only need the database (for `npm run dev`), you can bring up just the DB service:

```bash
docker compose up -d postgres
```

Then run `npm run dev` locally—the app will use the running Postgres instance thanks to the `DATABASE_URL` environment variable.

### SQLite (local-only)
Set `USE_SQLITE=true` in your `.env` if you prefer a file-based database. With that flag, no Postgres server is required: the app will create `data/nudgebot.sqlite` and initialize the tables automatically. Keep this mode for local testing, because SQLite files won’t be durable on Render/Vercel. Leave the flag unset (or `USE_SQLITE=false`) for production deployments backed by Postgres.

## Changing the OpenRouter model
The default model now points to `minimax/minimax-m2.5:free`. Override it via `DEFAULT_MODEL` in your `.env` or by editing `lib/config.ts` if you need a hardcoded value.
