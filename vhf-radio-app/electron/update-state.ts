export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  version?: string;
  currentVersion?: string;
  percent?: number;
  error?: string;
}
