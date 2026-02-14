import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // PTT global shortcuts
  registerPTT: (accelerator: string) => ipcRenderer.send('ptt:register', accelerator),
  unregisterPTT: () => ipcRenderer.send('ptt:unregister'),
  onPTTActivated: (callback: () => void) => {
    ipcRenderer.on('ptt:activated', callback);
    return () => ipcRenderer.removeListener('ptt:activated', callback);
  },
  // Platform info
  platform: process.platform,
});
