import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // PTT global shortcuts
  registerPTT: (accelerator: string) => ipcRenderer.send('ptt:register', accelerator),
  unregisterPTT: () => ipcRenderer.send('ptt:unregister'),
  onPTTDown: (callback: () => void) => {
    ipcRenderer.on('ptt:down', callback);
    return () => ipcRenderer.removeListener('ptt:down', callback);
  },
  onPTTUp: (callback: () => void) => {
    ipcRenderer.on('ptt:up', callback);
    return () => ipcRenderer.removeListener('ptt:up', callback);
  },
  // Platform info
  platform: process.platform,
});
