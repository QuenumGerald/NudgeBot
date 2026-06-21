#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const envExample = join(repoRoot, 'backend', '.env.example');
const envFile = join(repoRoot, 'backend', '.env');

function step(message) {
  console.log(`\n▶ ${message}`);
}

function run(command, args, cwd) {
  const pretty = [command, ...args].join(' ');
  console.log(`$ ${pretty}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`Command failed: ${pretty}`);
  }
}

async function promptHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('ADMIN_PASSWORD must be provided with NUDGEBOT_ADMIN_PASSWORD when running without an interactive terminal.');
  }

  return await new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;
    let value = '';

    readline.emitKeypressEvents(input);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    output.write(question);

    const onKeypress = (char, key = {}) => {
      if (key.name === 'return' || key.name === 'enter') {
        input.setRawMode(wasRaw);
        input.off('keypress', onKeypress);
        output.write('\n');
        resolve(value);
        return;
      }

      if (key.name === 'backspace' || key.name === 'delete') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write('\b \b');
        }
        return;
      }

      if (key.ctrl && key.name === 'c') {
        input.setRawMode(wasRaw);
        input.off('keypress', onKeypress);
        output.write('\n');
        process.exit(130);
      }

      if (char && !key.ctrl && !key.meta) {
        value += char;
        output.write('*');
      }
    };

    input.on('keypress', onKeypress);
  });
}

async function chooseAdminPassword() {
  const fromEnv = (process.env.NUDGEBOT_ADMIN_PASSWORD || '').trim();
  if (fromEnv) {
    if (fromEnv.length < 4) {
      throw new Error('NUDGEBOT_ADMIN_PASSWORD must contain at least 4 characters.');
    }
    return fromEnv;
  }

  while (true) {
    const password = await promptHidden('Choose an admin password (minimum 4 characters): ');
    if (password.length < 4) {
      console.log('Password must contain at least 4 characters.');
      continue;
    }

    const confirmation = await promptHidden('Confirm admin password: ');
    if (password !== confirmation) {
      console.log('Passwords do not match. Please try again.');
      continue;
    }

    return password;
  }
}

async function ensureEnvFile() {
  if (existsSync(envFile)) {
    console.log('backend/.env already exists; keeping your current configuration.');
    return;
  }

  if (!existsSync(envExample)) {
    throw new Error('Missing backend/.env.example; cannot create backend/.env.');
  }

  const jwtSecret = randomBytes(64).toString('hex');
  const adminPassword = await chooseAdminPassword();
  const env = readFileSync(envExample, 'utf8')
    .replace(/^CORS_ORIGIN=.*$/m, 'CORS_ORIGIN=http://localhost:3000')
    .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${adminPassword}`)
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwtSecret}`);

  writeFileSync(envFile, env);
  console.log('Created backend/.env with your ADMIN_PASSWORD and a generated JWT_SECRET.');
  console.log('You can change the password later in backend/.env.');
}

try {
  console.log('NudgeBot installer');
  console.log(`Repository: ${repoRoot}`);
  console.log(`Platform: ${process.platform}`);

  step('Checking Node.js version');
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (major < 20) {
    throw new Error(`Node.js 20+ is required. Current version: ${process.version}`);
  }
  console.log(`Node.js ${process.version} OK`);

  step('Installing root dependencies');
  run(npmCmd, ['install'], repoRoot);

  step('Installing backend dependencies');
  run(npmCmd, ['install', '--legacy-peer-deps'], join(repoRoot, 'backend'));

  step('Installing frontend dependencies');
  run(npmCmd, ['install'], join(repoRoot, 'frontend'));

  step('Creating local environment file');
  await ensureEnvFile();

  console.log('\n✅ Installation complete!');
  console.log('Next steps:');
  console.log('1. Edit backend/.env and add at least one LLM API key (DEEPSEEK_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY).');
  console.log('2. Start NudgeBot with: npm run dev');
  console.log('3. Open: http://localhost:3000');
} catch (error) {
  console.error(`\n❌ Installation failed: ${error.message}`);
  process.exit(process.exitCode || 1);
}
