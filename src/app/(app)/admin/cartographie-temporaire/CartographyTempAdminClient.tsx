'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eye, RefreshCw, Trash2 } from 'lucide-react';

interface DraftSummary {
  id: string;
  owner_id: string;
  owner_identifiant: string | null;
  title: string;
  last_autosaved_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

interface DraftDetail extends DraftSummary {
  payload: unknown;
  exports: Record<string, string>;
}

export default function CartographyTempAdminClient({
  initialEnabled,
  initialConfigured,
  initialUpdatedAt,
  initialDrafts,
  editorUrl,
}: {
  initialEnabled: boolean;
  initialConfigured: boolean;
  initialUpdatedAt: string | null;
  initialDrafts: DraftSummary[];
  editorUrl: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [configured, setConfigured] = useState(initialConfigured);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [password, setPassword] = useState('');
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedDraftId, setSelectedDraftId] = useState(initialDrafts[0]?.id ?? null);
  const [selectedDraft, setSelectedDraft] = useState<DraftDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  useEffect(() => {
    if (selectedDraftId && !selectedDraft) {
      void loadDraft(selectedDraftId);
    }
  }, [selectedDraft, selectedDraftId]);

  const copyText = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const refreshDrafts = async () => {
    const res = await fetch('/api/admin/cartography-drafts');
    const json = await res.json();
    if (res.ok) {
      setDrafts(json.drafts ?? []);
      if (json.drafts?.length && !selectedDraftId) {
        setSelectedDraftId(json.drafts[0].id);
      }
    }
  };

  const loadDraft = async (id: string) => {
    setSelectedDraftId(id);
    setSelectedDraft(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/cartography-drafts/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Impossible de charger le brouillon');
      setSelectedDraft(json.draft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setLoadingDetail(false);
    }
  };

  const saveAccess = async () => {
    setSavingAccess(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/cartography-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          password: password.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur de sauvegarde');
      setEnabled(Boolean(json.enabled));
      setConfigured(Boolean(json.configured));
      setUpdatedAt(json.updated_at ?? null);
      setPassword('');
      setMessage('Accès cartographie mis à jour.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setSavingAccess(false);
    }
  };

  const deleteDraft = async (id: string) => {
    const res = await fetch(`/api/admin/cartography-drafts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || 'Suppression impossible');
      return;
    }
    const nextDrafts = drafts.filter((draft) => draft.id !== id);
    setDrafts(nextDrafts);
    if (selectedDraftId === id) {
      setSelectedDraft(null);
      setSelectedDraftId(nextDrafts[0]?.id ?? null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Accès temporaire</h2>
            <p className="text-sm text-slate-400">
              Active le module, définis le mot de passe à partager, puis envoie l’URL aux cartographes.
            </p>
          </div>
          <button onClick={() => void refreshDrafts()} className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              Activer la cartographie temporaire
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={configured ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Définir le mot de passe'}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
            <button onClick={() => void saveAccess()} disabled={savingAccess} className="rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white disabled:opacity-60">
              {savingAccess ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
            {message && <p className="text-sm text-emerald-400">{message}</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            <p>Module : <span className={enabled ? 'text-emerald-400' : 'text-slate-500'}>{enabled ? 'activé' : 'désactivé'}</span></p>
            <p>Mot de passe configuré : <span className={configured ? 'text-emerald-400' : 'text-slate-500'}>{configured ? 'oui' : 'non'}</span></p>
            <p>Dernière mise à jour : <span className="text-slate-400">{updatedAt ? new Date(updatedAt).toLocaleString('fr-FR') : 'Jamais'}</span></p>
            <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
              <span className="truncate text-xs text-slate-400">{editorUrl}</span>
              <button onClick={() => void copyText('editor-url', editorUrl)} className="shrink-0 text-slate-300">
                {copied === 'editor-url' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Brouillons reçus</h2>
          <div className="space-y-2">
            {drafts.length === 0 && <p className="text-sm text-slate-500">Aucun brouillon pour le moment.</p>}
            {drafts.map((draft) => (
              <button
                key={draft.id}
                onClick={() => void loadDraft(draft.id)}
                className={`w-full rounded-xl border p-3 text-left ${selectedDraftId === draft.id ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/60'}`}
              >
                <p className="font-medium text-slate-200">{draft.title}</p>
                <p className="text-xs text-slate-500">{draft.owner_identifiant || draft.owner_id}</p>
                <p className="text-xs text-slate-500">Maj : {draft.updated_at ? new Date(draft.updated_at).toLocaleString('fr-FR') : 'Jamais'}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4">
          {!selectedSummary && <p className="text-sm text-slate-500">Sélectionne un brouillon.</p>}
          {selectedSummary && !selectedDraft && !loadingDetail && (
            <div className="space-y-3">
              <p className="text-slate-200">{selectedSummary.title}</p>
              <button onClick={() => void loadDraft(selectedSummary.id)} className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300">
                Ouvrir
              </button>
            </div>
          )}
          {loadingDetail && <p className="text-sm text-slate-400">Chargement du brouillon...</p>}
          {selectedDraft && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">{selectedDraft.title}</h2>
                  <p className="text-sm text-slate-400">{selectedDraft.owner_identifiant || selectedDraft.owner_id}</p>
                  <p className="text-xs text-slate-500">Autosauvegarde : {selectedDraft.last_autosaved_at ? new Date(selectedDraft.last_autosaved_at).toLocaleString('fr-FR') : 'Jamais'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void deleteDraft(selectedDraft.id)} className="rounded-lg bg-red-600/20 px-3 py-2 text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-cyan-300" />
                  <h3 className="text-sm font-medium text-slate-200">Exports à copier</h3>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {Object.entries(selectedDraft.exports).map(([key, value]) => (
                    <button
                      key={key}
                      onClick={() => void copyText(`draft-${key}`, value)}
                      className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300"
                    >
                      <span>{key}</span>
                      {copied === `draft-${key}` ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
