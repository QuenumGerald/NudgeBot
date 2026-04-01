# ⚡ NudgeBot - Déploiement Rapide

## 🎯 Solution Alternative - Déploiement Manuel

Le repository GitHub a des problèmes de structure. Voici la solution rapide:

### Étape 1: Créer un Repository GitHub

1. Allez sur https://github.com/new
2. Nom: `NudgeBot`
3. Public (recommandé pour Render)
4. Ne cochez aucune case
5. Créez le repository

### Étape 2: Poussez votre code

```bash
# Ajoutez le remote GitHub (remplacez VOTRE_USERNAME)
git remote set-url origin https://github.com/VOTRE_USERNAME/NudgeBot.git

# Poussez tout le code
git add .
git commit -m "NudgeBot ready for Render deployment"
git push -u origin main
```

### Étape 3: Déployez sur Render

1. Allez sur https://render.com
2. Connectez-vous avec votre compte GitHub
3. Cliquez sur "New +" → "Web Service"
4. Sélectionnez le repository `NudgeBot`
5. Configuration:
   - **Name**: `nudgebot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server-express.js`
   - **Plan**: `Starter` (ou Free)

### Étape 4: Variables d'Environnement

Ajoutez ces variables dans Render:
- `NODE_ENV` = `production`
- `API_ONLY` = `false`
- `DEFAULT_MODEL` = `deepseek/deepseek-chat`
- `PORT` = `10000`
- `OPENROUTER_API_KEY` = `votre-clé-api`
- `DEEPSEEK_API_KEY` = `votre-clé-api`

### 🎉 Résultat

Votre NudgeBot sera disponible à: `https://nudgebot.onrender.com`

---

*Temps estimé: 5-10 minutes maximum*
