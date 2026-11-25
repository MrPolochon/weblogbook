export type DesktopUpdateState = {
  status: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
};
