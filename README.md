# NudgeBot

NudgeBot est un monorepo **frontend React + backend Express** pour un assistant conversationnel avec streaming SSE.

## Prérequis

- Node.js 20+
- npm 10+

## Variables d'environnement (backend)

Créer `backend/.env` (ou configurer ces variables en production) :

- `PORT=3000`
- `ADMIN_PASSWORD=...` (mot de passe admin)
- `JWT_SECRET=...` (secret long et aléatoire)
- `JWT_EXPIRES_IN=12h` (optionnel)
- `CORS_ORIGIN=https://ton-domaine.com` (liste séparée par des virgules)
- `RATE_LIMIT_MAX=300` (optionnel)
- `LLM_PROVIDER=deepseek|openrouter|openai`
- `LLM_MODEL=...` (optionnel)
- `DEEPSEEK_API_KEY=...` / `OPENROUTER_API_KEY=...` / `OPENAI_API_KEY=...`
- `DATABASE_URL=/data/nudgebot.sqlite` (prod) ou chemin local sqlite

## Démarrage local

```bash
npm install
npm run dev
```

Application disponible sur `http://localhost:3000` (backend + assets frontend servis par Express).

## Build production

```bash
npm run build
npm start
```

## Architecture rapide

- `frontend/` : interface React + Vite.
- `backend/` : API Express (`/api/auth`, `/api/chat`, `/api/settings`).
- SQLite pour stockage local (`users`, `settings`).

