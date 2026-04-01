# 🚀 NudgeBot - Guide de Déploiement 1-Clic

## ✅ Status: PRÊT POUR DÉPLOIEMENT

Votre système NudgeBot est maintenant configuré pour un déploiement 1-clic sur Render !

### 🎯 Actions Immédiates

1. **Poussez votre code sur GitHub:**
   ```bash
   git push -u origin main
   ```

2. **Application disponible:** https://nudgebot-v2.onrender.com

3. **Dashboard Render:** https://dashboard.render.com/web/srv-d76e14udqaus73cugsig

### 🔧 Configuration des Variables d'Environnement

Dans le dashboard Render, configurez ces clés API:

- **OPENROUTER_API_KEY**: `sk-or-v1-votre-clé-ici`
- **DEEPSEEK_API_KEY**: `sk-votre-clé-ici`

### 📋 Fichiers de Déploiement

- ✅ `render.yaml` - Configuration Render
- ✅ `package.json` - Dépendances Node.js
- ✅ `server-express.js` - Serveur hybride
- ✅ `deploy-render.sh` - Script de déploiement
- ✅ `README.md` - Documentation complète

### 🎉 Fonctionnalités

- **Déploiement automatique** à chaque push
- **Serveur hybride** (Frontend + Backend)
- **Support Cline CLI** intégré
- **Interface Next.js** moderne
- **Variables d'environnement** pré-configurées

### 🔄 Mise à Jour

Pour mettre à jour votre application:
```bash
git add .
git commit -m "Mise à jour"
git push
```

Le déploiement est automatiquement déclenché !

---

*Votre NudgeBot est prêt pour le déploiement 1-clic sur Render 🎯*
