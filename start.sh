#!/bin/bash

echo "Starting NudgeBot server..."

while true; do
    node server-express.js
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Server stopped (exit code $?), restarting in 2 seconds..."
    sleep 2
done
