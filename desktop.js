const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const http = require('http');

let port = 3000;

function getFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      resolve(0);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function startServer() {
  const userDataDir = app.getPath('userData');
  const envFilePath = path.join(userDataDir, '.env');
  
  console.log(`[desktop] User data directory: ${userDataDir}`);
  console.log(`[desktop] Config file path: ${envFilePath}`);

  // Create .env in userData if it doesn't exist
  if (!fs.existsSync(envFilePath)) {
    const templatePath = path.join(__dirname, 'backend', '.env.example');
    let template = '';
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, 'utf8');
    } else {
      template = `PORT=3000\nADMIN_PASSWORD=admin\nJWT_SECRET=${crypto.randomBytes(64).toString('hex')}\n`;
    }
    
    const randomPassword = crypto.randomBytes(8).toString('hex');
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    
    const envContent = template
      .replace(/^PORT=.*$/m, 'PORT=3000')
      .replace(/^CORS_ORIGIN=.*$/m, 'CORS_ORIGIN=http://localhost:3000')
      .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${randomPassword}`)
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwtSecret}`);
      
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(envFilePath, envContent, 'utf8');
    console.log(`[desktop] Generated initial .env config`);
  }

  // Load env variables into process.env from the userData env file
  if (fs.existsSync(envFilePath)) {
    const envVars = fs.readFileSync(envFilePath, 'utf8');
    envVars.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.length > 0 && val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') {
          val = val.substring(1, val.length - 1);
        }
        if (val.length > 0 && val.charAt(0) === "'" && val.charAt(val.length - 1) === "'") {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }

  // Find a free port dynamically
  const freePort = await getFreePort();
  if (freePort) {
    port = freePort;
  }
  process.env.PORT = String(port);
  process.env.CORS_ORIGIN = `http://localhost:${port}`;
  process.env.NUDGEBOT_WORKDIR = path.join(userDataDir, 'workspace');
  process.env.BLAZERJOB_DB_PATH = path.join(userDataDir, 'blazerjob.db');
  process.env.NUDGEBOT_ENV_PATH = envFilePath;
  process.env.NUDGEBOT_DESKTOP = 'true';

  console.log(`[desktop] Starting backend on port ${port}...`);
  // Load the backend server
  require('./backend/dist/server.js');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'NudgeBot Desktop',
    backgroundColor: '#0a0a0a',
    show: false
  });

  // Load loading screen immediately
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('file:') || url.startsWith('data:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const request = http.request({
      host: '127.0.0.1',
      port: port,
      path: '/api/setup/status',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 302);
    });

    request.on('error', () => {
      resolve(false);
    });

    request.end();
  });
}

async function waitForServer(port, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await checkServerReady(port);
    if (ready) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Server did not start responding on port ${port} after 3 seconds.`);
}

app.whenReady().then(async () => {
  createWindow();

  // Start the server asynchronously so the window shows up instantly
  setTimeout(async () => {
    try {
      await startServer();
      await waitForServer(port);
      if (mainWindow) {
        mainWindow.loadURL(`http://localhost:${port}`);
      }
    } catch (error) {
      console.error('[desktop] Failed to start backend:', error);
      dialog.showErrorBox(
        'NudgeBot Startup Error',
        `Failed to start the local backend server:\n\n${error.stack || error.message || error}`
      );
    }
  }, 100);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
