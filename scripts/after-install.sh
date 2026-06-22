#!/bin/sh
set -e

# Set ownership to root and permissions to 4755 for chrome-sandbox
# to prevent Electron crash due to sandbox helper permission issues.
if [ -f "/opt/NudgeBot/chrome-sandbox" ]; then
    chown root:root "/opt/NudgeBot/chrome-sandbox"
    chmod 4755 "/opt/NudgeBot/chrome-sandbox"
fi
