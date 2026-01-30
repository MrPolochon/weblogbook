'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Trash2, X, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function PilotesActions({
  piloteId,
  identifiant,
  isAdmin,
  role,
}: {
  piloteId: string;
  identifiant: string;
  isAdmin: boolean;
  role?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [superadminModal, setSuperadminModal] = useState<{ identifiant: string; reason?: string } | null>(null);
  const [superadminPwd, setSuperadminPwd] = useState('');
  const [superadminError, setSuperadminError] = useState<string | null>(null);

  async function doDelete(superadminPassword?: string) {
    setDeleting(true);
    setSuperadminError(null);
    try {
      const opts: RequestInit = { method: 'DELETE' };
      if (superadminPassword != null) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify({ superadminPassword });
      }
      const res = await fetch(`/api/pilotes/${piloteId}`, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data?.error || 'Erreur lors de la suppression';
        
        // Si la protection anti-suppression massive est déclenchée, afficher le modal
        if (data?.requiresSuperadmin && !superadminModal) {
          setSuperadminModal({ 
            identifiant, 
            reason: `⚠️ Protection anti-suppression massive activée !\n\nVous avez supprimé ${data.deletionCount} comptes en moins de 10 minutes.`
          });
          setSuperadminPwd('');
          setDeleting(false);
          return;
        }
        
        if (superadminModal) {
          setSuperadminError(errorMsg);
        } else {
          alert(errorMsg);
        }
        setDeleting(false);
        return;
      }
      setSuperadminModal(null);
      setSuperadminPwd('');
      router.refresh();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Erreur lors de la suppression';
      if (superadminModal) {
        setSuperadminError(errorMsg);
      } else {
        alert(errorMsg);
      }
      setDeleting(false);
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteClick() {
    if (isAdmin) {
      setSuperadminModal({ identifiant });
      setSuperadminPwd('');
      setSuperadminError(null);
    } else {
      if (!confirm(`Supprimer le compte de ${identifiant} ? Toutes les données seront effacées. Les vols seront archivés 1 semaine.`)) return;
      doDelete();
    }
  }

  async function handleSuperadminSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!superadminPwd.trim()) {
      setSuperadminError('Saisissez le mot de passe superadmin.');
      return;
    }
    await doDelete(superadminPwd);
    if (!superadminError) setDeleting(false);
  }

  return (
    <div className="flex items-center gap-2">
      {!isAdmin && (
        <Link
          href={`/admin/pilotes/${piloteId}`}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
          title="Heures, blocage"
        >
          <Settings className="h-4 w-4" />
        </Link>
      )}
      {role !== 'atc' && (
        <Link
          href={`/admin/pilotes/${piloteId}/logbook`}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
          title="Voir le logbook"
        >
          <BookOpen className="h-4 w-4" />
        </Link>
      )}
      <button
        onClick={handleDeleteClick}
        disabled={deleting}
        className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-red-400 disabled:opacity-50"
        title={isAdmin ? 'Supprimer cet admin' : 'Supprimer'}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {superadminModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => !deleting && setSuperadminModal(null)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">
                {superadminModal.reason ? 'Confirmation requise' : 'Supprimer l\'admin'}
              </h3>
              <button type="button" onClick={() => !deleting && setSuperadminModal(null)} className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            {superadminModal.reason && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                <p className="text-amber-300 text-sm whitespace-pre-line">{superadminModal.reason}</p>
              </div>
            )}
            <p className="text-slate-300 text-sm mb-4">
              Supprimer le compte de <strong>{superadminModal.identifiant}</strong> ? Saisissez le mot de passe superadmin pour confirmer.
            </p>
            <form onSubmit={handleSuperadminSubmit} className="space-y-4">
              <div>
                <label className="label">Mot de passe superadmin</label>
                <input
                  type="password"
                  className="input"
                  value={superadminPwd}
                  onChange={(e) => { setSuperadminPwd(e.target.value); setSuperadminError(null); }}
                  placeholder="••••••••"
                  autoFocus
                  disabled={deleting}
                />
              </div>
              {superadminError && <p className="text-red-400 text-sm">{superadminError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary" onClick={() => !deleting && setSuperadminModal(null)} disabled={deleting}>
                  Annuler
                </button>
                <button type="submit" className="btn-danger" disabled={deleting}>
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
