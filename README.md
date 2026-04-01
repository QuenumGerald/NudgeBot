# ✨ NudgeBot

Agent autonome puissant avec API REST pour déploiement sur Render.

## 🚀 Déploiement 1-Clic sur Render

1. **Application API**: https://nudgebot-v2.onrender.com
2. **Dashboard**: https://dashboard.render.com/web/srv-d76e14udqaus73cugsig
3. **Endpoint**: `/api/chat`

## ⚙️ Variables d'Environnement

Configurez dans le dashboard Render:
- `OPENROUTER_API_KEY`: Clé API OpenRouter
- `DEEPSEEK_API_KEY`: Clé API DeepSeek  
- `DEFAULT_MODEL`: deepseek/deepseek-chat
- `NODE_ENV`: production
- `API_ONLY`: true
- `PORT`: 10000

## 📡 API Usage

```bash
curl -X POST https://nudgebot-v2.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
```

## 🛠 Architecture

- **Backend**: Express.js pur (pas de Next.js)
- **IA**: Cline CLI integration
- **Déploiement**: Render API-only mode

---
*Built for reliable deployment*
