const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');

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
    console.log(`[desktop] Generated initial .env config with password: ${randomPassword}`);
    
    global.firstLaunchPassword = randomPassword;
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

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (global.firstLaunchPassword) {
      mainWindow.webContents.executeJavaScript(`
        alert("Welcome to NudgeBot Desktop!\\n\\nYour automatically generated admin password is:\\n\\n${global.firstLaunchPassword}\\n\\nYou can copy this password and change it in the Settings of the application.");
      `).catch(console.error);
      delete global.firstLaunchPassword;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('file:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
