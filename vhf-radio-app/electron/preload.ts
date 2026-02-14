import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Auto-updater
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
