export {};

declare global {
  interface Window {
    electronAPI?: {
      registerPTT: (accelerator: string) => void;
      unregisterPTT: () => void;
      onPTTDown: (callback: () => void) => () => void;
      onPTTUp: (callback: () => void) => () => void;
      platform: string;
    };
  }
}
