import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let registeredShortcut: string | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 380,
    minHeight: 600,
    title: 'VHF Radio — WebLogbook',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
  });

  // Dev or prod
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── PTT global shortcut ──
ipcMain.on('ptt:register', (_event, accelerator: string) => {
  // Unregister previous
  if (registeredShortcut) {
    try { globalShortcut.unregister(registeredShortcut); } catch { /* */ }
    registeredShortcut = null;
  }
  if (!accelerator) return;

  try {
    const electronAccelerator = convertToElectronAccelerator(accelerator);
    if (!electronAccelerator) return;

    globalShortcut.register(electronAccelerator, () => {
      mainWindow?.webContents.send('ptt:activated');
    });
    registeredShortcut = electronAccelerator;
  } catch (err) {
    console.error('[PTT] Failed to register global shortcut:', err);
  }
});

ipcMain.on('ptt:unregister', () => {
  if (registeredShortcut) {
    try { globalShortcut.unregister(registeredShortcut); } catch { /* */ }
    registeredShortcut = null;
  }
});

/**
 * Convert web key label (e.g. "Ctrl+Space") to Electron accelerator format.
 */
function convertToElectronAccelerator(label: string): string | null {
  const mapping: Record<string, string> = {
    'Space': 'Space',
    'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E',
    'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J',
    'KeyK': 'K', 'KeyL': 'L', 'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O',
    'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyS': 'S', 'KeyT': 'T',
    'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X', 'KeyY': 'Y',
    'KeyZ': 'Z',
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3',
    'Digit4': '4', 'Digit5': '5', 'Digit6': '6', 'Digit7': '7',
    'Digit8': '8', 'Digit9': '9',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5',
    'F6': 'F6', 'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10',
    'F11': 'F11', 'F12': 'F12',
    'Tab': 'Tab', 'Enter': 'Return', 'Escape': 'Escape',
    'Backspace': 'Backspace', 'Delete': 'Delete',
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'NumpadEnter': 'numadd', 'Numpad0': 'num0', 'Numpad1': 'num1',
    'Numpad2': 'num2', 'Numpad3': 'num3', 'Numpad4': 'num4',
    'Numpad5': 'num5', 'Numpad6': 'num6', 'Numpad7': 'num7',
    'Numpad8': 'num8', 'Numpad9': 'num9',
  };

  const parts = label.split('+');
  const mapped: string[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (['Ctrl', 'Control'].includes(p)) { mapped.push('CommandOrControl'); continue; }
    if (p === 'Shift') { mapped.push('Shift'); continue; }
    if (p === 'Alt') { mapped.push('Alt'); continue; }
    if (p === 'Meta') { mapped.push('Super'); continue; }
    const m = mapping[p];
    if (m) { mapped.push(m); continue; }
    // Fallback — try raw
    if (p.length === 1) { mapped.push(p.toUpperCase()); continue; }
    return null; // Unknown key
  }
  return mapped.join('+');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
