import { StartupGate, startupUrl } from './startup';
import { installPtt } from './ptt';
import { app, BrowserWindow, Menu } from 'electron';
import { installDesktopUpdates } from './updates';
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

  const window = mainWindow;
  const gate = new StartupGate(() => {
    if (!window.isDestroyed()) void window.loadURL('https://www.mixouairlinesptfsweblogbook.com/pilote');
  }, () => { updates.install(); });
  if (process.env.VITE_DEV_SERVER_URL) {
    gate.ready = true;
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(startupUrl);
  }

  installPtt(mainWindow);
  const updates = installDesktopUpdates(mainWindow, state => {
    gate.update(state);
    const menu = Menu.getApplicationMenu();
    const status = menu?.getMenuItemById('update-status');
    const install = menu?.getMenuItemById('install-update');
    if (status) status.label = 'Windows ' + state.currentVersion + ' · ' + ({
      idle: 'Mises à jour automatiques', checking: 'Recherche…', downloading: 'Téléchargement ' + (state.percent ?? 0) + ' %',
      downloaded: 'Mise à jour prête', 'up-to-date': 'À jour', error: 'Nouvel essai automatique prévu',
    }[state.status]);
    if (install) install.enabled = state.status === 'downloaded';
  }, startupUrl);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!gate.ready) { event.preventDefault(); return; }
    const target = new URL(url);
    if (!['https://www.mixouairlinesptfsweblogbook.com', 'https://mixouairlinesptfsweblogbook.com'].includes(target.origin)) event.preventDefault();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Radio', submenu: [
      { label: 'COM box du site · PTT global', click: () => { if (!gate.ready) return; void mainWindow?.loadURL('https://www.mixouairlinesptfsweblogbook.com/pilote'); } },
      { label: 'Radio classique', click: () => { if (!gate.ready) return; void mainWindow?.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'Mises à jour', submenu: [
      { id: 'update-status', label: 'Windows ' + app.getVersion() + ' · Mises à jour automatiques', enabled: false },
      { label: 'Rechercher une mise à jour', click: () => { void updates.check(); } },
      { id: 'install-update', label: 'Installer et redémarrer', enabled: false, click: () => { updates.install(); } },
    ] },
    { label: 'Affichage', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
  ]));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

