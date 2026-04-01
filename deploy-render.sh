#!/bin/bash

# NudgeBot Render Deployment Script
echo "🚀 NudgeBot - Déploiement sur Render"

# Configuration
SERVICE_NAME="nudgebot"
REPO_URL="https://github.com/QuenumGerald/NudgeBot"
RENDER_URL="https://nudgebot-v2.onrender.com"

echo "📋 Configuration:"
echo "- Service: $SERVICE_NAME"
echo "- Repository: $REPO_URL"
echo "- URL: $RENDER_URL"

# Vérification du dépôt Git
echo "🔍 Vérification du repository..."
if [ ! -d ".git" ]; then
    echo "❌ Ce n'est pas un repository Git. Initialisation..."
    git init
    git add .
    git commit -m "Initial commit - NudgeBot ready for Render"
    echo "🔗 Ajout du remote origin..."
    git remote add origin $REPO_URL
    echo "⚠️  Vous devez pousser manuellement: git push -u origin main"
else
    echo "✅ Repository Git détecté"
fi

# Vérification des fichiers essentiels
echo "🔍 Vérification des fichiers essentiels..."
required_files=("package.json" "server-express.js" "render.yaml")
missing_files=()

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -ne 0 ]; then
    echo "❌ Fichiers manquants: ${missing_files[*]}"
    exit 1
else
    echo "✅ Tous les fichiers essentiels sont présents"
fi

# Instructions de déploiement
echo ""
echo "🎯 ÉTAPES SUIVANTES:"
echo "1. Poussez votre code sur GitHub:"
echo "   git push -u origin main"
echo ""
echo "2. Votre NudgeBot sera disponible à: $RENDER_URL"
echo "3. Configurez vos clés API dans le dashboard Render:"
echo "   - OPENROUTER_API_KEY"
echo "   - DEEPSEEK_API_KEY"
echo ""
echo "4. Dashboard Render: https://dashboard.render.com/web/srv-d76e14udqaus73cugsig"
echo ""
echo "🎉 NudgeBot est prêt pour le déploiement 1-clic !"
