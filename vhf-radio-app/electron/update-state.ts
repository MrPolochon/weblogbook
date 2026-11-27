export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  version?: string;
  currentVersion?: string;
  percent?: number;
  progress?: number;
  releaseNotes?: string;
  error?: string;
  checkedAt?: string;
}
