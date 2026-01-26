'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, X, Loader2, AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface Invitation {
  id: string;
  compagnie: { id: string; nom: string; code_oaci: string | null } | null;
  message_invitation: string | null;
  created_at: string;
}

interface HistoriqueItem {
  id: string;
  compagnie: { id: string; nom: string; code_oaci: string | null } | null;
  statut: string;
  repondu_at: string | null;
}

interface Props {
  invitations: Invitation[];
  historique: HistoriqueItem[];
}

export default function InvitationsClient({ invitations, historique }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmRefus, setConfirmRefus] = useState<string | null>(null);

  async function handleRepondre(invitationId: string, action: 'accepter' | 'refuser') {
    if (action === 'refuser' && confirmRefus !== invitationId) {
      setConfirmRefus(invitationId);
      return;
    }

    setLoading(invitationId);
    setError('');
    setConfirmRefus(null);

    try {
      const res = await fetch('/api/recrutement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: invitationId, action })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(data.message);
      router.refresh();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-3 text-emerald-300">
          <Check className="h-5 w-5 flex-shrink-0" />
          <p>{success}</p>
          <button onClick={() => setSuccess('')} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Invitations en attente */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Offres d&apos;emploi</h2>

        {invitations.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Aucune invitation en attente.</p>
            <p className="text-sm text-slate-500 mt-1">
              Les compagnies vous contacteront ici pour vous proposer un emploi.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {invitations.map((inv) => (
              <div 
                key={inv.id} 
                className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/30 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20">
                      <Building2 className="h-6 w-6 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-slate-100">
                        {inv.compagnie?.nom || 'Compagnie inconnue'}
                      </h3>
                      {inv.compagnie?.code_oaci && (
                        <p className="text-sm text-slate-400 font-mono">{inv.compagnie.code_oaci}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Clock className="h-4 w-4" />
                    {new Date(inv.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>
                </div>

                {inv.message_invitation && (
                  <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-sm text-slate-400 italic">&quot;{inv.message_invitation}&quot;</p>
                  </div>
                )}

                {/* Boutons de réponse */}
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  {confirmRefus === inv.id ? (
                    <>
                      <p className="text-sm text-red-400">Confirmer le refus ?</p>
                      <button
                        onClick={() => handleRepondre(inv.id, 'refuser')}
                        disabled={loading === inv.id}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        {loading === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        Oui, refuser
                      </button>
                      <button
                        onClick={() => setConfirmRefus(null)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleRepondre(inv.id, 'accepter')}
                        disabled={loading === inv.id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        {loading === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Accepter
                      </button>
                      <button
                        onClick={() => handleRepondre(inv.id, 'refuser')}
                        disabled={loading === inv.id}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        Refuser
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historique */}
      {historique.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Historique récent</h2>
          <div className="space-y-2">
            {historique.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30"
              >
                <div className="flex items-center gap-3">
                  {item.statut === 'acceptee' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : item.statut === 'refusee' ? (
                    <XCircle className="h-5 w-5 text-red-400" />
                  ) : (
                    <X className="h-5 w-5 text-slate-400" />
                  )}
                  <div>
                    <p className="text-slate-200 font-medium">{item.compagnie?.nom || 'Compagnie inconnue'}</p>
                    {item.repondu_at && (
                      <p className="text-xs text-slate-500">
                        {new Date(item.repondu_at).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  item.statut === 'acceptee' 
                    ? 'bg-emerald-500/20 text-emerald-300' 
                    : item.statut === 'refusee'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-slate-500/20 text-slate-300'
                }`}>
                  {item.statut === 'acceptee' ? 'Acceptée' : 
                   item.statut === 'refusee' ? 'Refusée' : 'Annulée'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
