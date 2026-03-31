#!/bin/bash

echo "Starting NudgeBot server..."

while true; do
    npm run dev
    echo "Server crashed, restarting in 2 seconds..."
    sleep 2
done
