#!/usr/bin/env node
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { name: 'Root node_modules', path: join(repoRoot, 'node_modules') },
  { name: 'Backend node_modules', path: join(repoRoot, 'backend', 'node_modules') },
  { name: 'Backend dist', path: join(repoRoot, 'backend', 'dist') },
  { name: 'Frontend node_modules', path: join(repoRoot, 'frontend', 'node_modules') },
  { name: 'Frontend dist', path: join(repoRoot, 'frontend', 'dist') },
  { name: 'Backend config (.env)', path: join(repoRoot, 'backend', '.env') }
];

async function confirmUninstall() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('This will delete all installed dependencies, build artifacts, and your backend/.env file.\nAre you sure you want to uninstall? (y/N): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      resolve(confirmed);
    });
  });
}

async function run() {
  console.log('NudgeBot Uninstaller');
  console.log(`Repository: ${repoRoot}\n`);

  const confirmed = await confirmUninstall();
  if (!confirmed) {
    console.log('\nAborted. Nothing was deleted.');
    return;
  }

  console.log('\nStarting cleanup...');
  for (const target of targets) {
    if (existsSync(target.path)) {
      console.log(`Removing ${target.name}...`);
      try {
        rmSync(target.path, { recursive: true, force: true });
        console.log(`✓ Removed ${target.name}`);
      } catch (err) {
        console.error(`✗ Failed to remove ${target.name}: ${err.message}`);
      }
    } else {
      console.log(`- ${target.name} not found, skipping.`);
    }
  }

  console.log('\n✅ Uninstall complete! The repository is now clean.');
}

run().catch(console.error);
