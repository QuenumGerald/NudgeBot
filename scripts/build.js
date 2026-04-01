#!/usr/bin/env node
const fs = require('fs');
const { spawnSync } = require('child_process');

const hasAppDir = fs.existsSync('app');
const hasPagesDir = fs.existsSync('pages');

if (!hasAppDir && !hasPagesDir) {
  console.log('[build] No app/ or pages/ directory found. Skipping next build (API-only mode).');
  process.exit(0);
}

console.log('[build] Detected Next.js app/pages directory. Running next build...');
const result = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true });

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
