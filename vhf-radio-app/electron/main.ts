import { installPtt } from './ptt';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 380,
    minHeight: 600,
    title: 'VHF Radio — WebLogbook',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
    autoHideMenuBar: false,
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL('https://www.mixouairlinesptfsweblogbook.com/pilote');
  }

  installPtt(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    if (!['https://www.mixouairlinesptfsweblogbook.com', 'https://mixouairlinesptfsweblogbook.com'].includes(target.origin)) event.preventDefault();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Radio', submenu: [
      { label: 'COM box du site · PTT global', click: () => { void mainWindow?.loadURL('https://www.mixouairlinesptfsweblogbook.com/pilote'); } },
      { label: 'Radio classique', click: () => { void mainWindow?.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'Affichage', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
  ]));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ══════════════════════════════════════════════════
   Auto-updater
   ══════════════════════════════════════════════════ */

function setupAutoUpdater() {
  // Don't check in dev
  if (process.env.VITE_DEV_SERVER_URL) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('updater:status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('updater:status', 'available');
    sendToRenderer('updater:info', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater:status', 'up-to-date');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('updater:status', 'downloaded');
    sendToRenderer('updater:info', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    sendToRenderer('updater:status', 'error');
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Check failed:', err.message);
    });
  }, 5000);
}

// IPC: renderer asks to install the update now
ipcMain.on('updater:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// IPC: renderer asks to check for updates manually
ipcMain.on('updater:check', () => {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdater] Manual check failed:', err.message);
  });
});

function sendToRenderer(channel: string, data: unknown) {
  mainWindow?.webContents.send(channel, data);
}

/* ══════════════════════════════════════════════════ */

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
