import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { DesktopUpdateState } from './update-state';

/** Updates continue independently of the current page, COM panel and microphone state. */
export function installDesktopUpdates(window: BrowserWindow, onState: (state: DesktopUpdateState) => void = () => {}, startupUrl?: string) {
  const contents = window.webContents;
  let state: DesktopUpdateState = { status: 'idle', currentVersion: app.getVersion() };
  let checking = false, closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const classicUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    if (event.sender !== contents || event.senderFrame !== event.sender.mainFrame) return false;
    if (startupUrl && event.senderFrame.url === startupUrl) return true;
    try {
      const url = new URL(event.senderFrame.url);
      if (['https://www.mixouairlinesptfsweblogbook.com', 'https://mixouairlinesptfsweblogbook.com'].includes(url.origin)) return true;
      url.hash = ''; url.search = '';
      return url.href === classicUrl;
    } catch { return false; }
  };
  const send = () => {
    if (closed || window.isDestroyed()) return;
    contents.send('updater:state', { ...state });
    // Preserve the classic radio and previously installed web bridge.
    contents.send('updater:status', state.status === 'downloading' ? 'available' : state.status);
    if (state.version) contents.send('updater:info', { version: state.version, releaseDate: '' });
    if (state.percent != null) contents.send('updater:progress', { percent: state.percent, transferred: 0, total: 0 });
    onState({ ...state });
  };
  const setState = (patch: Partial<DesktopUpdateState>) => { state = { ...state, ...patch }; send(); };
  const failed = () => {
    if (closed) return;
    setState({ status: 'error' });
    clearTimeout(retry);
    retry = setTimeout(() => { void check(); }, 5 * 60_000);
  };
  async function check() {
    if (closed || process.env.VITE_DEV_SERVER_URL || checking || state.status === 'downloading' || state.status === 'downloaded') return;
    checking = true;
    clearTimeout(retry);
    setState({ status: 'checking', percent: undefined });
    try { await autoUpdater.checkForUpdates(); } catch { failed(); } finally { checking = false; }
  }
  function install() {
    if (closed || state.status !== 'downloaded') return false;
    try { autoUpdater.quitAndInstall(false, true); return true; } catch { failed(); return false; }
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const available = (info: { version: string }) => setState({ status: 'downloading', version: info.version, percent: 0 });
  const downloaded = (info: { version: string }) => setState({ status: 'downloaded', version: info.version, percent: 100 });
  const current = () => setState({ status: 'up-to-date', version: undefined, percent: undefined });
  const progress = (info: { percent: number }) => setState({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(info.percent))) });
  autoUpdater.on('update-available', available);
  autoUpdater.on('update-downloaded', downloaded);
  autoUpdater.on('update-not-available', current);
  autoUpdater.on('download-progress', progress);
  autoUpdater.on('error', failed);
  const checkRequest = (event: Electron.IpcMainEvent) => { if (trusted(event)) void check(); };
  const installRequest = (event: Electron.IpcMainEvent) => { if (trusted(event)) install(); };
  ipcMain.on('updater:check', checkRequest);
  ipcMain.on('updater:install', installRequest);
  ipcMain.handle('updater:get-state', event => trusted(event) ? { ...state } : null);
  const resume = () => { void check(); };
  powerMonitor.on('resume', resume);
  contents.on('did-finish-load', send);
  const startup = setTimeout(resume, 5000);
  const periodic = setInterval(resume, 30 * 60_000);
  window.once('closed', () => {
    closed = true;
    clearTimeout(startup); clearTimeout(retry); clearInterval(periodic);
    powerMonitor.removeListener('resume', resume);
    contents.removeListener('did-finish-load', send);
    ipcMain.removeListener('updater:check', checkRequest);
    ipcMain.removeListener('updater:install', installRequest);
    ipcMain.removeHandler('updater:get-state');
    autoUpdater.removeListener('update-available', available);
    autoUpdater.removeListener('update-downloaded', downloaded);
    autoUpdater.removeListener('update-not-available', current);
    autoUpdater.removeListener('download-progress', progress);
    autoUpdater.removeListener('error', failed);
  });
  return { check, install, getState: () => ({ ...state }) };
}
