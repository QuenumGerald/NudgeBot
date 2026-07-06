# 🐝 NudgeBot — Assistant IA Autonome

NudgeBot est un assistant IA personnel (React + Express) conçu pour automatiser vos tâches tout en gardant un contrôle absolu sur vos données et vos coûts de tokens.

---

## 🌟 Fonctionnalités Clés

- **Mémoire persistante compressée** : Résume intelligemment les sessions de chat pour économiser les tokens.
- **Stockage hybride flexible** :
  - **Mode par défaut** : Sauvegarde locale ou synchronisation sur votre dépôt GitHub privé (`store/db.json`).
  - **Mode SQL Cloud** : Support natif de **Neon Postgres** avec migration transparente depuis GitHub et auto-nettoyage intelligent (pruning) pour rester sous la limite gratuite de 500 Mo.
- **Serveurs MCP à la demande** : Connectez Jira, Confluence, Google Calendar, GitHub, Netlify ou Render depuis vos réglages.
- **Délégation de code** : Intégration de **Google Jules** pour lui déléguer des tâches de programmation complexes directement sur vos dépôts GitHub.
- **Notifications d'emails** : Planifiez des emails de rappels récurrents (via Resend).

---

## 🚀 Démarrage Rapide

### 1. Installation automatique

Clonez le projet et lancez l'installateur interactif :

**macOS & Linux :**
```bash
git clone https://github.com/QuenumGerald/NudgeBot
cd NudgeBot
./install.sh
npm run dev
```

**Windows (PowerShell) :**
```powershell
git clone https://github.com/QuenumGerald/NudgeBot
cd NudgeBot
.\install.ps1
npm run dev
```

L'application est accessible sur `http://localhost:3000`.

---

## ⚙️ Variables d'Environnement principales

Configurez votre fichier `backend/.env` :

```env
# Authentification
ADMIN_PASSWORD=votre-mot-de-passe-admin
JWT_SECRET=votre-cle-secrete-jwt

# Modèle de Langage (LLM)
LLM_PROVIDER=deepseek      # deepseek, openai ou openrouter
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=votre-cle-api

# Optionnel : Base de données Neon (PostgreSQL)
DATABASE_URL=              # Connexion postgresql://...
DISABLE_DB_PRUNING=false   # Définir à true pour désactiver le nettoyage automatique

# Optionnel : Google Jules (Coding Agent)
JULES_API_KEY=

# Optionnel : Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@votre-domaine.com

# Optionnel : Synchronisation GitHub
GITHUB_TOKEN=              # Token d'accès classique (PAT)
```

Pour plus de détails sur les serveurs MCP ou le déploiement de production, consultez le fichier d'architecture [ARCHITECTURE.md](file:///home/nova/Documents/projects/NudgeBot/ARCHITECTURE.md).
