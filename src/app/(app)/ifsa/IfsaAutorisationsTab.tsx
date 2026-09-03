'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban, CheckCircle2, Clock, Plane, ShieldCheck, XCircle,
} from 'lucide-react';
import { IfsaEmptyState } from './IfsaEmptyState';

interface AutorisationExploitation {
  id: string;
  numero_document: string;
  statut: string;
  motif_demande: string | null;
  motif_reponse: string | null;
  created_at: string;
  traite_at: string | null;
  compagnie: { id: string; nom: string } | null;
  type_avion: { id: string; nom: string; code_oaci: string | null; constructeur: string | null } | null;
  demandeur: { id: string; identifiant: string } | null;
  traite_par: { id: string; identifiant: string } | null;
}

export default function IfsaAutorisationsTab({
  onPendingCountChange,
}: {
  onPendingCountChange?: (count: number) => void;
}) {
  const [autorisationsExploit, setAutorisationsExploit] = useState<AutorisationExploitation[]>([]);
  const [loadingAutorisations, setLoadingAutorisations] = useState(false);
  const [autorisationMotifsById, setAutorisationMotifsById] = useState<Record<string, string>>({});
  const [autorisationFilter, setAutorisationFilter] = useState<'en_attente' | 'approuvee' | 'toutes'>('en_attente');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function refreshPendingCount() {
    try {
      const res = await fetch('/api/autorisations-exploitation?toutes=true&statut=en_attente');
      const data = res.ok ? await res.json() : [];
      onPendingCountChange?.(Array.isArray(data) ? data.length : 0);
    } catch {
      // badge informatif seulement
    }
  }

  async function loadAutorisationsExploit(filtre?: string) {
    setLoadingAutorisations(true);
    try {
      const statutParam = (filtre || autorisationFilter) === 'toutes' ? '' : `&statut=${filtre || autorisationFilter}`;
      const res = await fetch(`/api/autorisations-exploitation?toutes=true${statutParam}`);
      if (res.ok) {
        const data = await res.json();
        setAutorisationsExploit(data.map((a: AutorisationExploitation & {
          compagnie?: AutorisationExploitation['compagnie'] | AutorisationExploitation['compagnie'][];
          type_avion?: AutorisationExploitation['type_avion'] | AutorisationExploitation['type_avion'][];
          demandeur?: AutorisationExploitation['demandeur'] | AutorisationExploitation['demandeur'][];
          traite_par?: AutorisationExploitation['traite_par'] | AutorisationExploitation['traite_par'][];
        }) => ({
          ...a,
          compagnie: Array.isArray(a.compagnie) ? a.compagnie[0] : a.compagnie,
          type_avion: Array.isArray(a.type_avion) ? a.type_avion[0] : a.type_avion,
          demandeur: Array.isArray(a.demandeur) ? a.demandeur[0] : a.demandeur,
          traite_par: Array.isArray(a.traite_par) ? a.traite_par[0] : a.traite_par,
        })));
      }
    } catch {
      toast.error('Erreur lors du chargement des autorisations');
    } finally {
      setLoadingAutorisations(false);
    }
  }

  useEffect(() => {
    void loadAutorisationsExploit();
    void refreshPendingCount();
    // Chargement initial de l’onglet uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTraiterAutorisation(id: string, action: 'approuver' | 'refuser' | 'revoquer') {
    setSubmittingId(id);
    try {
      const motifRaw = autorisationMotifsById[id]?.trim() ?? '';
      const res = await fetch('/api/autorisations-exploitation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, motif_reponse: motifRaw || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      const labels: Record<typeof action, string> = {
        approuver: 'Autorisation approuvée',
        refuser: 'Autorisation refusée',
        revoquer: 'Autorisation révoquée',
      };
      toast.success(data.message || labels[action]);
      setAutorisationMotifsById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadAutorisationsExploit();
      await refreshPendingCount();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du traitement');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-400" />
          Autorisations d&apos;exploitation
          <span className="text-xs font-medium text-slate-500 bg-slate-800/70 px-2 py-0.5 rounded-full">
            {autorisationsExploit.length}
          </span>
        </h2>
        <div className="inline-flex p-0.5 rounded-lg bg-slate-900/60 border border-slate-700/60">
          {(['en_attente', 'approuvee', 'toutes'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setAutorisationFilter(f); void loadAutorisationsExploit(f); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                autorisationFilter === f ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {f === 'en_attente' ? 'En attente' : f === 'approuvee' ? 'Approuvées' : 'Toutes'}
            </button>
          ))}
        </div>
      </div>

      {loadingAutorisations ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 w-full"></div>
          ))}
        </div>
      ) : autorisationsExploit.length === 0 ? (
        <IfsaEmptyState
          icon={ShieldCheck}
          title="Aucune demande d'autorisation"
          description={autorisationFilter === 'en_attente'
            ? 'Toutes les demandes ont été traitées. Belle journée !'
            : 'Aucune autorisation n\'a encore été enregistrée pour ce filtre.'}
        />
      ) : (
        <div className="space-y-3 stagger-enter">
          {autorisationsExploit.map((auth) => {
            const isEnAttente = auth.statut === 'en_attente';
            const isApprouvee = auth.statut === 'approuvee';
            const busy = submittingId === auth.id;
            return (
              <div
                key={auth.id}
                className={`group relative p-4 rounded-xl border transition-all duration-300 hover:-translate-y-0.5 ${
                  isEnAttente
                    ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-400/60 hover:shadow-md hover:shadow-amber-900/30'
                    : isApprouvee
                    ? 'bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-400/60 hover:shadow-md hover:shadow-emerald-900/30'
                    : 'bg-slate-800/40 border-slate-700/50 opacity-70 hover:opacity-100'
                }`}
              >
                {isEnAttente && (
                  <span aria-hidden className="absolute top-3 right-3 inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                  </span>
                )}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Plane className={`h-4 w-4 flex-shrink-0 ${isEnAttente ? 'text-amber-300' : isApprouvee ? 'text-emerald-300' : 'text-sky-400'}`} />
                      <span className="text-sm font-semibold text-slate-100">
                        {auth.type_avion?.nom || 'Type inconnu'}
                      </span>
                      {auth.type_avion?.constructeur && (
                        <span className="text-xs text-slate-500">({auth.type_avion.constructeur})</span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isEnAttente ? 'bg-amber-500/20 text-amber-400' :
                        isApprouvee ? 'bg-emerald-500/20 text-emerald-400' :
                        auth.statut === 'refusee' ? 'bg-red-500/20 text-red-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {isEnAttente && <Clock className="h-3 w-3" />}
                        {isApprouvee && <CheckCircle2 className="h-3 w-3" />}
                        {auth.statut === 'refusee' && <XCircle className="h-3 w-3" />}
                        {auth.statut === 'revoquee' && <Ban className="h-3 w-3" />}
                        {isEnAttente ? 'En attente' : isApprouvee ? 'Approuvée' : auth.statut === 'refusee' ? 'Refusée' : 'Révoquée'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 space-y-0.5 mt-1">
                      <p>
                        <span className="font-mono">{auth.numero_document}</span>
                        {' — '}
                        Compagnie: <span className="text-slate-300">{auth.compagnie?.nom || '?'}</span>
                        {' — '}
                        Demandeur: <span className="text-slate-300">{auth.demandeur?.identifiant || '?'}</span>
                      </p>
                      {auth.motif_demande && (
                        <p className="text-slate-400">Motif: &laquo; {auth.motif_demande} &raquo;</p>
                      )}
                      {auth.motif_reponse && (
                        <p className="text-slate-400 italic">Réponse IFSA: &laquo; {auth.motif_reponse} &raquo;</p>
                      )}
                      {auth.traite_par && (
                        <p>Traité par: {auth.traite_par.identifiant}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {isEnAttente && (
                      <>
                        <input
                          type="text"
                          placeholder="Motif (optionnel)"
                          value={autorisationMotifsById[auth.id] ?? ''}
                          onChange={(e) =>
                            setAutorisationMotifsById((prev) => ({
                              ...prev,
                              [auth.id]: e.target.value,
                            }))
                          }
                          className="input text-xs px-2 py-1 w-48"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleTraiterAutorisation(auth.id, 'approuver')}
                            disabled={busy}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approuver
                          </button>
                          <button
                            onClick={() => handleTraiterAutorisation(auth.id, 'refuser')}
                            disabled={busy}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium flex items-center gap-1"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Refuser
                          </button>
                        </div>
                      </>
                    )}
                    {isApprouvee && (
                      <>
                        <input
                          type="text"
                          placeholder="Motif révocation"
                          value={autorisationMotifsById[auth.id] ?? ''}
                          onChange={(e) =>
                            setAutorisationMotifsById((prev) => ({
                              ...prev,
                              [auth.id]: e.target.value,
                            }))
                          }
                          className="input text-xs px-2 py-1 w-48"
                        />
                        <button
                          onClick={() => handleTraiterAutorisation(auth.id, 'revoquer')}
                          disabled={busy}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Révoquer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
