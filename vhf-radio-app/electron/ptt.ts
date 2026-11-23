import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import * as path from 'node:path';

const keys: Record<string, number> = { Space: 32, ControlRight: 163, KeyV: 86 };
const origins = new Set(['https://www.mixouairlinesptfsweblogbook.com', 'https://mixouairlinesptfsweblogbook.com']);
export function installPtt(window: BrowserWindow) {
  let child: ChildProcessWithoutNullStreams | null = null;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let last = 0;
  const emit = (down: boolean) => { if (!window.isDestroyed()) window.webContents.send('radio:ptt', down); };
  const stop = () => { const old = child; child = null; old?.kill(); clearInterval(watchdog); emit(false); };
  ipcMain.handle('radio:configure', async (event, code: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame ||
        !origins.has(new URL(event.senderFrame.url).origin)) return false;
    stop();
    if (code === '') return true;
    if (process.platform !== 'win32' || typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(keys, code)) return false;
    const executable = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'native-bin', 'PttKey.exe');
    const processHandle = spawn(executable, [String(keys[code]), String(process.pid)], { windowsHide: true, stdio: 'pipe' });
    child = processHandle;
    let buffer = '';
    last = Date.now();
    processHandle.stdout.setEncoding('utf8');
    processHandle.stdout.on('data', (data: string) => {
      if (child !== processHandle) return;
      buffer += data;
      if (buffer.length > 1024) { stop(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const state = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (state !== '0' && state !== '1') { stop(); return; }
        last = Date.now(); emit(state === '1');
      }
    });
    processHandle.on('exit', () => { if (child === processHandle) stop(); });
    watchdog = setInterval(() => { if (Date.now() - last > 500) stop(); }, 100);
    return new Promise<boolean>(resolve => {
      processHandle.once('spawn', () => resolve(true));
      processHandle.once('error', () => { if (child === processHandle) stop(); resolve(false); });
    });
  });
  const navigating = (_event: unknown, _url: unknown, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace) stop(); };
  window.webContents.on('did-start-navigation', navigating);
  window.webContents.on('render-process-gone', stop);
  powerMonitor.on('suspend', stop);
  powerMonitor.on('lock-screen', stop);
  window.on('closed', () => {
    stop(); ipcMain.removeHandler('radio:configure');
    powerMonitor.removeListener('suspend', stop); powerMonitor.removeListener('lock-screen', stop);
  });
}
