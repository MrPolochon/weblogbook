'use client';

import { useEffect, useState } from 'react';
import type { DesktopUpdateState } from '../../vhf-radio-app/electron/update-state';

type UpdateApi = {
  getUpdateState?: () => Promise<DesktopUpdateState | null>;
  onUpdateState?: (callback: (state: DesktopUpdateState) => void) => () => void;
  onUpdateStatus: (callback: (status: string) => void) => () => void;
  onUpdateInfo: (callback: (info: { version: string }) => void) => () => void;
  onUpdateProgress: (callback: (progress: { percent: number }) => void) => () => void;
  checkForUpdate: () => void;
  installUpdate: () => void;
};
function updateApi(): UpdateApi | undefined {
  return typeof window === 'undefined' ? undefined : (window as Window & { electronAPI?: UpdateApi }).electronAPI;
}

export default function DesktopUpdateStatus() {
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  useEffect(() => {
    const api = updateApi();
    if (!api) return;
    let active = true;
    const initial: DesktopUpdateState = { status: 'idle', currentVersion: '' };
    setState(initial);
    const cleanups: (() => void)[] = [];
    if (api.onUpdateState && api.getUpdateState) {
      cleanups.push(api.onUpdateState(value => { if (active) setState(value); }));
      void api.getUpdateState().then(value => { if (active && value) setState(value); }).catch(() => {});
    } else {
      // Already installed 1.5.1/1.5.2 clients can display and install the new release too.
      cleanups.push(api.onUpdateStatus(status => setState(previous => ({ ...(previous ?? initial),
        status: status === 'available' ? 'downloading' : status as DesktopUpdateState['status'] }))));
      cleanups.push(api.onUpdateInfo(info => setState(previous => ({ ...(previous ?? initial), version: info.version }))));
      cleanups.push(api.onUpdateProgress(progress => setState(previous => ({ ...(previous ?? initial), percent: Math.round(progress.percent) }))));
      api.checkForUpdate();
    }
    return () => { active = false; cleanups.forEach(cleanup => cleanup()); };
  }, []);
  if (!state) return null;
  const busy = state.status === 'checking' || state.status === 'downloading';
  const labels = {
    idle: 'Mises à jour automatiques activées.', checking: 'Recherche de mise à jour…',
    downloading: `Téléchargement automatique${state.version ? ` de la version ${state.version}` : ''} : ${state.percent ?? 0} %`,
    downloaded: `Version ${state.version ?? ''} prête. Installation automatique à la fermeture.`,
    'up-to-date': 'Application à jour.', error: 'Mise à jour indisponible pour le moment. Tu peux relancer la recherche.',
  };
  return <div className="mt-3 rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs">
    <p className="font-semibold">Application Windows{state.currentVersion ? ` · ${state.currentVersion}` : ''}</p>
    <p role="status" className={`mt-1 ${state.status === 'error' ? 'text-amber-300' : 'text-slate-300'}`}>{labels[state.status]}</p>
    {state.status === 'downloading' && <progress aria-label="Téléchargement de la mise à jour" className="mt-2 w-full" value={state.percent ?? 0} max={100} />}
    <div className="mt-2 flex flex-wrap gap-2">
      {state.status === 'downloaded' ? <button type="button" onClick={() => updateApi()?.installUpdate()} className="rounded bg-emerald-700 px-3 py-2 text-white">Installer et redémarrer</button>
        : <button type="button" disabled={busy} onClick={() => updateApi()?.checkForUpdate()} className="rounded border border-slate-500 px-3 py-2 disabled:opacity-50">Rechercher une mise à jour</button>}
    </div>
    <p className="mt-2 text-slate-400">Le téléchargement se fait en arrière-plan. Tu peux poursuivre ta session et quitter l’application quand tu es prêt à installer.</p>
  </div>;
}
