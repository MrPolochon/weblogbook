export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      // Auto-updater
      onUpdateStatus: (callback: (status: string) => void) => () => void;
      onUpdateInfo: (callback: (info: { version: string; releaseDate: string }) => void) => () => void;
      onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
      installUpdate: () => void;
      checkForUpdate: () => void;
    };
  }
}
