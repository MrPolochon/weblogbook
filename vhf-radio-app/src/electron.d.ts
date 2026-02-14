export {};

declare global {
  interface Window {
    electronAPI?: {
      registerPTT: (accelerator: string) => void;
      unregisterPTT: () => void;
      onPTTActivated: (callback: () => void) => () => void;
      platform: string;
    };
  }
}
