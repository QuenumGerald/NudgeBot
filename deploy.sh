#!/bin/bash

# NudgeBot 1-Click Deploy Script for Render
echo "🚀 Starting NudgeBot deployment..."

# Check if we have the necessary tools
if ! command -v curl &> /dev/null; then
    echo "❌ curl is required but not installed."
    exit 1
fi

# Service URL (will be updated after deployment)
SERVICE_URL="https://nudgebot-yolk.onrender.com"

echo "📦 Deploying to Render..."
echo "🌐 Service will be available at: $SERVICE_URL"
echo "⏱️  Deployment usually takes 2-3 minutes..."

# Wait for deployment to complete
echo "⏳ Waiting for deployment to complete..."
sleep 30

# Check if service is ready
echo "🔍 Checking service status..."
for i in {1..10}; do
    if curl -s "$SERVICE_URL" > /dev/null; then
        echo "✅ Deployment successful! NudgeBot is now live at: $SERVICE_URL"
        echo "🎉 You can now use your NudgeBot!"
        break
    else
        echo "⏳ Still deploying... ($i/10)"
        sleep 15
    fi
done

if [ $i -eq 10 ]; then
    echo "⚠️  Deployment is still in progress. Please check manually at: $SERVICE_URL"
    echo "📊 You can also check the Render dashboard for detailed status."
fi

echo "🔗 Dashboard: https://dashboard.render.com/web/srv-d76e0uvpm1nc73940sng"
