import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopUpdateState } from './update-state';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Auto-updater
  getUpdateState: (): Promise<DesktopUpdateState | null> => ipcRenderer.invoke('updater:get-state'),
  onUpdateState: (callback: (state: DesktopUpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => callback(state);
    ipcRenderer.on('updater:state', handler);
    return () => ipcRenderer.removeListener('updater:state', handler);
  },
  onUpdateStatus: (callback: (status: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
  onUpdateInfo: (callback: (info: { version: string; releaseDate: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate: string }) => callback(info);
    ipcRenderer.on('updater:info', handler);
    return () => ipcRenderer.removeListener('updater:info', handler);
  },
  onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number }) => callback(progress);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  installUpdate: () => ipcRenderer.send('updater:install'),
  checkForUpdate: () => ipcRenderer.send('updater:check'),
});

if (['https://www.mixouairlinesptfsweblogbook.com', 'https://mixouairlinesptfsweblogbook.com'].includes(location.origin)) {
  contextBridge.exposeInMainWorld('radioDesktop', {
    configure: (code: string) => ipcRenderer.invoke('radio:configure', code),
    onPtt: (callback: (down: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, down: boolean) => callback(down === true);
      ipcRenderer.on('radio:ptt', handler);
      return () => ipcRenderer.removeListener('radio:ptt', handler);
    },
  });
}

