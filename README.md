# ✨ NudgeBot

Un agent autonome puissant (Cline CLI) fusionné avec une interface Next.js moderne. 

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/QuenumGerald/NudgeBot)

## 🚀 Installation 1-Clic
L'installation est ultra simple :
1. Cliquez sur le bouton **Deploy to Render** ci-dessus.
2. Saisissez vos clés API (OpenRouter ou DeepSeek).
3. Attendez 2 minutes... **Votre NudgeBot est en ligne !**

## 🎯 Déploiement Automatisé
```bash
# Script de déploiement 1-clic
./deploy.sh
```

## 💻 Installation Locale
```bash
git clone https://github.com/QuenumGerald/NudgeBot
cd NudgeBot
npm install
npm run build
npm start
```

## 🔗 Liens Utiles
- **Application**: https://nudgebot-v2.onrender.com
- **Dashboard**: https://dashboard.render.com/web/srv-d76e14udqaus73cugsig
- **Repository**: https://github.com/QuenumGerald/NudgeBot

## 🛠 Architecture
- **Backend** : Express.js (Orchestrateur de Cline CLI).
- **Frontend** : Next.js 15 (Tailwind CSS, Radix UI).
- **IA** : Cline Autonomous Agent (DeepSeek v3).
- **Déploiement** : Render (Node.js, Starter Plan).

## ⚙️ Variables d'Environnement
- `OPENROUTER_API_KEY`: Clé API OpenRouter
- `DEEPSEEK_API_KEY`: Clé API DeepSeek  
- `DEFAULT_MODEL`: Modèle par défaut (deepseek/deepseek-chat)
- `NODE_ENV`: Environnement (production)
- `API_ONLY`: Mode API uniquement (false pour 1-clic)

---
*Built with ❤️ for autonomous efficiency.*
