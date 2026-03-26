'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { calculerPrixHangar } from '@/lib/compagnie-utils';
import {
  Wrench, Building2, Users, Warehouse, Tags, ClipboardList,
  Loader2, Plus, Trash2, Check, X, Play, FileText, CreditCard,
  Truck, ParkingSquare, Search, Settings
} from 'lucide-react';

interface Entreprise {
  id: string;
  nom: string;
  description: string | null;
  pdg_id: string;
  my_role: string;
}

interface Employe {
  id: string;
  user_id: string;
  role: string;
  specialite: string | null;
  date_embauche: string;
  profile: { id: string; callsign: string } | null;
}

interface Hangar {
  id: string;
  aeroport_code: string;
  nom: string | null;
  capacite: number;
}

interface Tarif {
  id: string;
  type_avion_id: string | null;
  prix_par_point: number;
  duree_estimee_par_point: number;
  type_avion: { id: string; nom: string } | null;
}

interface Demande {
  id: string;
  compagnie_id: string;
  avion_id: string;
  hangar_id: string;
  statut: string;
  usure_avant: number | null;
  usure_apres: number | null;
  prix_total: number | null;
  score_qualite: number | null;
  commentaire_compagnie: string | null;
  commentaire_entreprise: string | null;
  created_at: string;
  compagnie: { id: string; nom: string } | null;
  avion: { id: string; immatriculation: string; nom: string } | null;
}

interface Detail {
  id: string;
  nom: string;
  description: string | null;
  pdg_id: string;
  employes: Employe[];
  hangars: Hangar[];
  tarifs: Tarif[];
  demandes: Demande[];
  compte: { id: string; vban: string; solde: number } | null;
  my_role: string | null;
  prix_hangar_base?: number;
  prix_hangar_multiplicateur?: number;
  alliance_reparation_actif?: boolean;
  alliance_id?: string | null;
  prix_alliance_pourcent?: number;
}

type Tab = 'dashboard' | 'demandes' | 'hangars' | 'tarifs' | 'employes' | 'parametres';

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  demandee: { label: 'Demandée', color: 'text-amber-400' },
  acceptee: { label: 'Acceptée', color: 'text-sky-400' },
  en_transit: { label: 'En transit', color: 'text-sky-300' },
  en_reparation: { label: 'En réparation', color: 'text-violet-400' },
  mini_jeux: { label: 'Mini-jeux', color: 'text-violet-300' },
  terminee: { label: 'Terminée', color: 'text-emerald-400' },
  facturee: { label: 'Facturée', color: 'text-amber-300' },
  payee: { label: 'Payée', color: 'text-emerald-300' },
  retour_transit: { label: 'Retour en transit', color: 'text-sky-300' },
  completee: { label: 'Complétée', color: 'text-emerald-500' },
  refusee: { label: 'Refusée', color: 'text-red-400' },
  annulee: { label: 'Annulée', color: 'text-slate-500' },
};

interface CatalogueEntreprise {
  id: string;
  nom: string;
  description: string | null;
  hangars: { id: string; entreprise_id: string; aeroport_code: string; nom: string | null; capacite: number }[];
  tarifs: unknown[];
}

export default function ReparationClient({ userId }: { userId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demander = searchParams.get('demander') === '1';
  const avionId = searchParams.get('avion_id') || '';
  const compagnieId = searchParams.get('compagnie_id') || '';

  const [loading, setLoading] = useState(true);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mode "demander réparation" (client)
  const [catalogue, setCatalogue] = useState<CatalogueEntreprise[]>([]);
  const [selectedEntId, setSelectedEntId] = useState<string | null>(null);
  const [selectedHangarId, setSelectedHangarId] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState('');

  useEffect(() => {
    if (demander && avionId && compagnieId) {
      fetch('/api/reparation/catalogue').then(r => r.json()).then(d => setCatalogue(Array.isArray(d) ? d : [])).catch(() => setCatalogue([])).finally(() => setLoading(false));
    } else {
      fetch('/api/reparation/entreprises').then(r => r.json()).then(d => setEntreprises(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [demander, avionId, compagnieId]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/reparation/entreprises/${id}`);
    if (res.ok) setDetail(await res.json());
  }, []);

  useEffect(() => {
    if (!demander && entreprises.length === 1 && !detail) loadDetail(entreprises[0].id);
  }, [demander, entreprises, detail, loadDetail]);

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(''); } else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  }

  async function api(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      return data;
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  // Mode "demander réparation" (client) : catalogue -> sélection hangar -> envoi demande
  if (demander && avionId && compagnieId) {
    const selectedEnt = selectedEntId ? catalogue.find(e => e.id === selectedEntId) : null;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Wrench className="h-7 w-7 text-orange-400" />Demander une réparation</h1>
          <p className="text-slate-400 mt-1">Choisissez une entreprise et un hangar pour envoyer votre avion en réparation.</p>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">{success}</p>}

        {!selectedEntId ? (
          <div className="space-y-3">
            <h2 className="text-lg font-medium text-slate-200">Sélectionner une entreprise</h2>
            {catalogue.length === 0 ? (
              <p className="text-slate-500">Aucune entreprise de réparation disponible.</p>
            ) : (
              <div className="grid gap-3">
                {catalogue.map(e => (
                  <button
                    key={e.id}
                    onClick={() => { setSelectedEntId(e.id); setSelectedHangarId(null); }}
                    className="w-full text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 hover:bg-slate-800/50 transition"
                  >
                    <span className="font-semibold text-slate-100">{e.nom}</span>
                    {e.description && <p className="text-slate-400 text-sm mt-1">{e.description}</p>}
                    <p className="text-xs text-slate-500 mt-1">{e.hangars.length} hangar(s)</p>
                  </button>
                ))}
              </div>
            )}
            <Link href={`/ma-compagnie?c=${compagnieId}`} className="text-sm text-slate-400 hover:text-slate-300">← Retour à ma flotte</Link>
          </div>
        ) : selectedEnt ? (
          <div className="space-y-4">
            <button onClick={() => { setSelectedEntId(null); setSelectedHangarId(null); }} className="text-sm text-slate-400 hover:text-slate-300">← Changer d&apos;entreprise</button>
            <h2 className="text-lg font-medium text-slate-200">Choisir un hangar — {selectedEnt.nom}</h2>
            {selectedEnt.hangars.length === 0 ? (
              <p className="text-slate-500">Aucun hangar disponible.</p>
            ) : (
              <div className="space-y-3">
                {selectedEnt.hangars.map(h => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                    <div>
                      <span className="font-mono text-slate-200">{h.aeroport_code}</span>
                      {h.nom && <span className="text-slate-400 ml-2">— {h.nom}</span>}
                      <span className="text-xs text-slate-500 ml-2">Cap: {h.capacite}</span>
                    </div>
                    <button
                      onClick={() => setSelectedHangarId(selectedHangarId === h.id ? null : h.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedHangarId === h.id ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                    >
                      {selectedHangarId === h.id ? 'Sélectionné' : 'Choisir'}
                    </button>
                  </div>
                ))}
                {selectedHangarId && (
                  <div className="pt-4 border-t border-slate-700 space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Message (optionnel)</label>
                      <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Instructions ou remarques..." className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" rows={2} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await api('/api/reparation/demandes', 'POST', {
                              entreprise_id: selectedEnt.id,
                              compagnie_id: compagnieId,
                              avion_id: avionId,
                              hangar_id: selectedHangarId,
                              commentaire: commentaire.trim() || undefined,
                            });
                            flash('Demande envoyée !');
                            setTimeout(() => router.push(`/ma-compagnie?c=${compagnieId}`), 1500);
                          } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                        }}
                        className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50"
                      >
                        Envoyer la demande
                      </button>
                      <button onClick={() => { setSelectedHangarId(null); setCommentaire(''); }} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (!detail && entreprises.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Wrench className="h-7 w-7 text-orange-400" />Entreprise de Réparation</h1>
          <p className="text-slate-400 mt-1">Vous n&apos;êtes employé dans aucune entreprise de réparation.</p>
          <p className="text-slate-500 text-sm mt-2">La création d&apos;entreprises de réparation est gérée par les administrateurs.</p>
        </div>
      </div>
    );
  }

  if (!detail && entreprises.length > 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Wrench className="h-7 w-7 text-orange-400" />Mes entreprises</h1>
        {entreprises.map(e => (
          <button key={e.id} onClick={() => loadDetail(e.id)} className="w-full text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 hover:bg-slate-800/50 transition">
            <span className="font-semibold text-slate-100">{e.nom}</span>
            <span className="ml-2 text-xs text-slate-500">{e.my_role}</span>
          </button>
        ))}
      </div>
    );
  }

  if (!detail) return null;

  const isPdg = detail.my_role === 'pdg' || detail.pdg_id === userId;
  const tabs: { key: Tab; label: string; icon: typeof Wrench }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: Building2 },
    { key: 'demandes', label: 'Demandes', icon: ClipboardList },
    { key: 'hangars', label: 'Hangars', icon: Warehouse },
    { key: 'tarifs', label: 'Tarifs', icon: Tags },
    { key: 'employes', label: 'Employés', icon: Users },
    ...(isPdg ? [{ key: 'parametres' as Tab, label: 'Paramètres', icon: Settings }] : []),
  ];

  return (
    <div className="space-y-6">
      {entreprises.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">Entreprise :</span>
          <select
            value={detail.id}
            onChange={(e) => loadDetail(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm font-medium"
          >
            {entreprises.map(e => (
              <option key={e.id} value={e.id}>{e.nom}</option>
            ))}
          </select>
          <button
            onClick={() => setDetail(null)}
            className="text-sm text-slate-400 hover:text-slate-300"
          >
            ← Voir la liste
          </button>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Wrench className="h-7 w-7 text-orange-400" />{detail.nom}</h1>
          {detail.description && <p className="text-slate-400 mt-1">{detail.description}</p>}
        </div>
        {detail.compte && (
          <div className="text-right">
            <p className="text-lg font-bold text-emerald-400">{detail.compte.solde.toLocaleString('fr-FR')} F$</p>
            <p className="text-xs text-slate-500 font-mono">VBAN: {detail.compte.vban}</p>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-700 pb-px">
        {tabs.map(t => {
          const Icon = t.icon;
          const count = t.key === 'demandes' ? detail.demandes.filter(d => !['completee', 'refusee', 'annulee'].includes(d.statut)).length : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition ${tab === t.key ? 'bg-slate-800 text-orange-400 border-b-2 border-orange-400' : 'text-slate-400 hover:text-slate-200'}`}>
              <Icon className="h-4 w-4" />{t.label}
              {count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-orange-600 text-white">{count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        {tab === 'dashboard' && <DashboardTab detail={detail} />}
        {tab === 'demandes' && <DemandesTab detail={detail} api={api} flash={flash} busy={busy} onRefresh={() => loadDetail(detail.id)} router={router} />}
        {tab === 'hangars' && <HangarsTab detail={detail} isPdg={isPdg} api={api} flash={flash} busy={busy} onRefresh={() => loadDetail(detail.id)} />}
        {tab === 'tarifs' && <TarifsTab detail={detail} isPdg={isPdg} api={api} flash={flash} busy={busy} onRefresh={() => loadDetail(detail.id)} />}
        {tab === 'employes' && <EmployesTab detail={detail} isPdg={isPdg} api={api} flash={flash} busy={busy} onRefresh={() => loadDetail(detail.id)} />}
        {tab === 'parametres' && isPdg && <ParametresTab detail={detail} api={api} flash={flash} busy={busy} onRefresh={() => loadDetail(detail.id)} />}
      </div>
    </div>
  );
}

function DashboardTab({ detail }: { detail: Detail }) {
  const active = detail.demandes.filter(d => !['completee', 'refusee', 'annulee'].includes(d.statut));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Employés" value={detail.employes.length} />
        <Stat label="Hangars" value={detail.hangars.length} />
        <Stat label="Demandes actives" value={active.length} />
        <Stat label="Solde" value={detail.compte ? `${detail.compte.solde.toLocaleString('fr-FR')} F$` : '—'} />
      </div>
      {active.length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2">Demandes en cours</h3>
          {active.slice(0, 5).map(d => (
            <div key={d.id} className="text-sm text-slate-300 py-1 flex items-center gap-2">
              <span className="font-mono">{d.avion?.immatriculation || '?'}</span>
              <span className="text-slate-500">—</span>
              <span>{d.compagnie?.nom || '?'}</span>
              <span className={`text-xs font-medium ${STATUT_LABELS[d.statut]?.color || 'text-slate-400'}`}>{STATUT_LABELS[d.statut]?.label || d.statut}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-slate-700/30 p-3 text-center"><p className="text-2xl font-bold text-slate-100">{value}</p><p className="text-xs text-slate-400">{label}</p></div>;
}

function DemandesTab({ detail, api, flash, busy, onRefresh, router }: {
  detail: Detail; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const active = detail.demandes.filter(d => !['completee', 'refusee', 'annulee'].includes(d.statut));
  const past = detail.demandes.filter(d => ['completee', 'refusee', 'annulee'].includes(d.statut));

  async function doAction(demandeId: string, action: string, extra?: Record<string, unknown>) {
    try {
      await api(`/api/reparation/demandes/${demandeId}`, 'PATCH', { action, ...extra });
      flash(`Action "${action}" effectuée`);
      onRefresh();
    } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
  }

  return (
    <div className="space-y-6">
      {active.length === 0 && past.length === 0 && <p className="text-slate-500 text-sm">Aucune demande.</p>}

      {active.map(d => (
        <div key={d.id} className="p-4 rounded-lg bg-slate-700/20 border border-slate-700/30 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-200">{d.avion?.immatriculation || '?'}</span>
              <span className="text-slate-400">— {d.compagnie?.nom || '?'}</span>
            </div>
            <span className={`text-sm font-medium ${STATUT_LABELS[d.statut]?.color || ''}`}>
              {STATUT_LABELS[d.statut]?.label || d.statut}
            </span>
          </div>
          <div className="text-xs text-slate-400 space-x-4">
            <span>Usure: {d.usure_avant ?? '?'}%{d.usure_apres != null ? ` → ${d.usure_apres}%` : ''}</span>
            {d.prix_total != null && <span>Prix: {d.prix_total.toLocaleString('fr-FR')} F$</span>}
            {d.score_qualite != null && <span>Score: {d.score_qualite}/100</span>}
          </div>
          {d.commentaire_compagnie && <p className="text-xs text-slate-400">Client: {d.commentaire_compagnie}</p>}

          <div className="flex gap-2 flex-wrap pt-1">
            {d.statut === 'demandee' && (
              <>
                <button disabled={busy} onClick={() => doAction(d.id, 'accepter')} className="px-3 py-1 rounded bg-emerald-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><Check className="h-3 w-3" />Accepter</button>
                <button disabled={busy} onClick={() => doAction(d.id, 'refuser')} className="px-3 py-1 rounded bg-red-600/50 text-red-200 text-xs disabled:opacity-50 flex items-center gap-1"><X className="h-3 w-3" />Refuser</button>
              </>
            )}
            {d.statut === 'acceptee' && (
              <button disabled={busy} onClick={() => doAction(d.id, 'ferry_arrive')} className="px-3 py-1 rounded bg-sky-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><Truck className="h-3 w-3" />Avion arrivé</button>
            )}
            {d.statut === 'en_reparation' && (
              <button disabled={busy} onClick={() => router.push(`/reparation/jeu/${d.id}`)} className="px-3 py-1 rounded bg-violet-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><Play className="h-3 w-3" />Jouer les mini-jeux</button>
            )}
            {d.statut === 'mini_jeux' && (
              <>
                <button disabled={busy} onClick={() => router.push(`/reparation/jeu/${d.id}`)} className="px-3 py-1 rounded bg-violet-600/50 text-violet-200 text-xs disabled:opacity-50 flex items-center gap-1"><Play className="h-3 w-3" />Continuer les jeux</button>
                <button disabled={busy} onClick={() => doAction(d.id, 'terminer')} className="px-3 py-1 rounded bg-emerald-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><Check className="h-3 w-3" />Terminer réparation</button>
              </>
            )}
            {d.statut === 'terminee' && (
              <button disabled={busy} onClick={() => doAction(d.id, 'facturer')} className="px-3 py-1 rounded bg-amber-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><FileText className="h-3 w-3" />Facturer</button>
            )}
            {d.statut === 'payee' && (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => doAction(d.id, 'completer', { livraison: 'parking' })} className="px-3 py-1 rounded bg-slate-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><ParkingSquare className="h-3 w-3" />Laisser au parking</button>
                <button disabled={busy} onClick={() => doAction(d.id, 'completer', { livraison: 'ferry' })} className="px-3 py-1 rounded bg-sky-600 text-white text-xs disabled:opacity-50 flex items-center gap-1"><Truck className="h-3 w-3" />Ferry retour</button>
              </div>
            )}
            {!['completee', 'refusee', 'annulee', 'facturee', 'payee'].includes(d.statut) && (
              <button disabled={busy} onClick={() => doAction(d.id, 'annuler')} className="px-3 py-1 rounded bg-slate-700 text-slate-300 text-xs disabled:opacity-50">Annuler</button>
            )}
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2">Historique</h3>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {past.map(d => (
              <div key={d.id} className="text-sm text-slate-400 py-1">
                {d.avion?.immatriculation || '?'} — {d.compagnie?.nom || '?'} — <span className={STATUT_LABELS[d.statut]?.color || ''}>{STATUT_LABELS[d.statut]?.label || d.statut}</span>
                {d.score_qualite != null && ` — Score: ${d.score_qualite}/100`}
                {d.prix_total != null && ` — ${d.prix_total.toLocaleString('fr-FR')} F$`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const AEROPORTS_TRIES = [...AEROPORTS_PTFS].sort((a, b) => a.code.localeCompare(b.code));

function HangarsTab({ detail, isPdg, api, flash, busy, onRefresh }: {
  detail: Detail; isPdg: boolean; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
}) {
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [capacite, setCapacite] = useState('2');

  const aeroportsDisponibles = useMemo(() => {
    const codesExistants = new Set(detail.hangars.map(h => h.aeroport_code));
    return AEROPORTS_TRIES.filter(a => !codesExistants.has(a.code));
  }, [detail.hangars]);

  const base = detail.prix_hangar_base ?? 500000;
  const mult = detail.prix_hangar_multiplicateur ?? 2;
  const cap = Math.max(1, Math.min(20, Number(capacite) || 2));
  const prixProchain = calculerPrixHangar(detail.hangars.length + 1, cap, base, mult);

  return (
    <div className="space-y-4">
      {detail.hangars.map(h => (
        <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/20">
          <div>
            <span className="font-mono text-slate-200">{h.aeroport_code}</span>
            {h.nom && <span className="text-slate-400 ml-2">— {h.nom}</span>}
            <span className="text-xs text-slate-500 ml-2">Cap: {h.capacite}</span>
          </div>
          {isPdg && (
            <button disabled={busy} onClick={async () => {
              try { await api(`/api/reparation/hangars?id=${h.id}`, 'DELETE'); flash('Hangar supprimé'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="text-red-400 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {detail.hangars.length === 0 && <p className="text-slate-500 text-sm">Aucun hangar.</p>}

      {isPdg && (
        <div className="pt-4 border-t border-slate-700 space-y-2">
          <h4 className="text-sm font-medium text-slate-300">Ajouter un hangar</h4>
          <p className="text-slate-400 text-sm">
            Prix : <span className="text-emerald-400 font-medium">
              {prixProchain === 0 ? 'Gratuit' : `${prixProchain.toLocaleString('fr-FR')} F$`}
            </span>
          </p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={code}
              onChange={e => setCode(e.target.value)}
              disabled={aeroportsDisponibles.length === 0}
              className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 min-w-[200px] text-sm disabled:opacity-50"
            >
              <option value="">
                {aeroportsDisponibles.length === 0 ? 'Tous les aéroports ont déjà un hangar' : 'Sélectionner un aéroport'}
              </option>
              {aeroportsDisponibles.map(a => (
                <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>
              ))}
            </select>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom (opt.)" className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 flex-1 text-sm" />
            <input type="number" min="1" max="20" value={capacite} onChange={e => setCapacite(e.target.value)} placeholder="Cap." className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-20 text-sm" />
            <button disabled={busy || !code.trim()} onClick={async () => {
              try {
                const res = await api('/api/reparation/hangars', 'POST', { entreprise_id: detail.id, aeroport_code: code.trim(), nom: nom.trim() || undefined, capacite: Number(capacite) || 2 }) as { ok?: boolean; prix?: number };
                flash(prixProchain > 0 ? `Hangar ajouté (${(res?.prix ?? prixProchain).toLocaleString('fr-FR')} F$)` : 'Hangar ajouté');
                setCode('');
                setNom('');
                onRefresh();
              } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50 flex items-center gap-1"><Plus className="h-4 w-4" />Ajouter</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TarifsTab({ detail, isPdg, api, flash, busy, onRefresh }: {
  detail: Detail; isPdg: boolean; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
}) {
  const [prix, setPrix] = useState('1000');
  const [duree, setDuree] = useState('2');

  return (
    <div className="space-y-4">
      {detail.tarifs.map(t => (
        <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/20">
          <div>
            <span className="text-slate-200">{t.type_avion?.nom || 'Tarif par défaut'}</span>
            <span className="text-slate-400 ml-2">— {t.prix_par_point.toLocaleString('fr-FR')} F$/point</span>
            <span className="text-xs text-slate-500 ml-2">~{t.duree_estimee_par_point} min/point</span>
          </div>
        </div>
      ))}
      {detail.tarifs.length === 0 && <p className="text-slate-500 text-sm">Aucun tarif défini. Le tarif par défaut sera appliqué.</p>}

      {isPdg && (
        <div className="pt-4 border-t border-slate-700 space-y-2">
          <h4 className="text-sm font-medium text-slate-300">Définir le tarif par défaut</h4>
          <div className="flex gap-2 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">F$ par point d&apos;usure</label>
              <input type="number" min="0" value={prix} onChange={e => setPrix(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-32 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Min. par point</label>
              <input type="number" min="1" value={duree} onChange={e => setDuree(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-24 text-sm" />
            </div>
            <div className="flex items-end">
              <button disabled={busy} onClick={async () => {
                try { await api('/api/reparation/tarifs', 'PATCH', { entreprise_id: detail.id, prix_par_point: Number(prix) || 1000, duree_estimee_par_point: Number(duree) || 2 }); flash('Tarif enregistré'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
              }} className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParametresTab({ detail, api, flash, busy, onRefresh }: {
  detail: Detail; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
}) {
  const [prixBase, setPrixBase] = useState(String(detail.prix_hangar_base ?? 500000));
  const [prixMult, setPrixMult] = useState(String(detail.prix_hangar_multiplicateur ?? 2));
  const [allianceActif, setAllianceActif] = useState(detail.alliance_reparation_actif ?? false);
  const [allianceId, setAllianceId] = useState(detail.alliance_id ?? '');
  const [prixAlliancePct, setPrixAlliancePct] = useState(String(detail.prix_alliance_pourcent ?? 80));
  const [alliances, setAlliances] = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    setPrixBase(String(detail.prix_hangar_base ?? 500000));
    setPrixMult(String(detail.prix_hangar_multiplicateur ?? 2));
    setAllianceActif(detail.alliance_reparation_actif ?? false);
    setAllianceId(detail.alliance_id ?? '');
    setPrixAlliancePct(String(detail.prix_alliance_pourcent ?? 80));
  }, [detail.id, detail.prix_hangar_base, detail.prix_hangar_multiplicateur, detail.alliance_reparation_actif, detail.alliance_id, detail.prix_alliance_pourcent]);

  useEffect(() => {
    fetch('/api/alliances?list=1').then(r => r.json()).then(d => setAlliances(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-slate-200">Prix des hangars</h3>
      <p className="text-sm text-slate-400">Même logique que les hubs : 1er gratuit, 2e au prix de base, puis multiplication.</p>
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Prix de base (2e hangar) F$</label>
          <input type="number" min="0" value={prixBase} onChange={e => setPrixBase(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-36 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Multiplicateur</label>
          <input type="number" min="1" max="10" step="0.5" value={prixMult} onChange={e => setPrixMult(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-24 text-sm" />
        </div>
      </div>

      <hr className="border-slate-700" />

      <h3 className="text-lg font-medium text-slate-200">Tarif alliance</h3>
      <p className="text-sm text-slate-400">Offrir un prix réduit aux membres d&apos;une alliance sélectionnée.</p>
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allianceActif} onChange={e => setAllianceActif(e.target.checked)} className="rounded" />
          <span className="text-slate-200">Activer le tarif alliance</span>
        </label>
        {allianceActif && (
          <>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Alliance (une seule)</label>
              <select value={allianceId} onChange={e => setAllianceId(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 min-w-[200px] text-sm">
                <option value="">Sélectionner une alliance</option>
                {alliances.map(a => (
                  <option key={a.id} value={a.id}>{a.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Pourcentage du tarif normal (80 = 20% de réduction)</label>
              <input type="number" min="0" max="100" value={prixAlliancePct} onChange={e => setPrixAlliancePct(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-24 text-sm" />
            </div>
          </>
        )}
      </div>

      <button disabled={busy} onClick={async () => {
        try {
          await api(`/api/reparation/entreprises/${detail.id}`, 'PATCH', {
            prix_hangar_base: Number(prixBase) || 500000,
            prix_hangar_multiplicateur: Number(prixMult) || 2,
            alliance_reparation_actif: allianceActif,
            alliance_id: allianceActif && allianceId ? allianceId : null,
            prix_alliance_pourcent: Number(prixAlliancePct) || 80,
          });
          flash('Paramètres enregistrés');
          onRefresh();
        } catch (err) {
          flash(err instanceof Error ? err.message : 'Erreur', true);
        }
      }} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50">
        Enregistrer les paramètres
      </button>

      <hr className="border-slate-700 my-6" />

      <div className="pt-4 border-t border-red-700/30 space-y-3">
        <h3 className="font-medium text-red-400">Zone dangereuse</h3>
        <p className="text-sm text-slate-400">Fermer l&apos;entreprise supprime définitivement tous les hangars, employés et demandes. Cette action est irréversible.</p>
        <FermerEntrepriseButton detail={detail} api={api} flash={flash} busy={busy} onSuccess={() => window.location.href = '/reparation'} />
      </div>
    </div>
  );
}

function FermerEntrepriseButton({ detail, api, flash, busy, onSuccess }: {
  detail: Detail; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onSuccess: () => void;
}) {
  const [step, setStep] = useState(0);
  const [typedConfirm, setTypedConfirm] = useState('');

  const MOT_CLE = 'FERMER';

  if (step === 0) {
    return (
      <button
        disabled={busy}
        onClick={() => setStep(1)}
        className="px-4 py-2 rounded-lg bg-red-600/30 text-red-300 text-sm font-medium hover:bg-red-600/50 disabled:opacity-50"
      >
        Fermer l&apos;entreprise
      </button>
    );
  }

  if (step === 1) {
    return (
      <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/30 space-y-3">
        <p className="text-slate-200 font-medium">1ère confirmation</p>
        <p className="text-sm text-slate-400">Êtes-vous sûr de vouloir fermer l&apos;entreprise <strong>{detail.nom}</strong> ? Cette action est irréversible.</p>
        <div className="flex gap-2">
          <button onClick={() => setStep(2)} className="px-3 py-1.5 rounded-lg bg-red-600/50 text-red-200 text-sm font-medium hover:bg-red-600/70">Continuer</button>
          <button onClick={() => setStep(0)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-sm">Annuler</button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/30 space-y-3">
        <p className="text-slate-200 font-medium">2e confirmation</p>
        <p className="text-sm text-slate-400">Toutes les demandes, hangars et employés seront définitivement supprimés. Le compte Felitz sera également supprimé.</p>
        <div className="flex gap-2">
          <button onClick={() => setStep(3)} className="px-3 py-1.5 rounded-lg bg-red-600/50 text-red-200 text-sm font-medium hover:bg-red-600/70">Je confirme</button>
          <button onClick={() => setStep(1)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-sm">Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/30 space-y-3">
      <p className="text-slate-200 font-medium">3e confirmation</p>
      <p className="text-sm text-slate-400">Tapez <strong className="font-mono text-red-300">{MOT_CLE}</strong> pour confirmer définitivement :</p>
      <input
        type="text"
        value={typedConfirm}
        onChange={e => setTypedConfirm(e.target.value.toUpperCase())}
        placeholder={MOT_CLE}
        className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm font-mono uppercase"
      />
      <div className="flex gap-2">
        <button
          disabled={busy || typedConfirm !== MOT_CLE}
          onClick={async () => {
            try {
              await api(`/api/reparation/entreprises/${detail.id}`, 'DELETE', { confirm: 'SUPPRIMER' });
              flash('Entreprise fermée');
              onSuccess();
            } catch (err) {
              flash(err instanceof Error ? err.message : 'Erreur', true);
            }
          }}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-red-500"
        >
          Confirmer définitivement
        </button>
        <button onClick={() => { setStep(2); setTypedConfirm(''); }} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-sm">Retour</button>
      </div>
    </div>
  );
}

function EmployesTab({ detail, isPdg, api, flash, busy, onRefresh }: {
  detail: Detail; isPdg: boolean; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; callsign: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState('technicien');

  async function searchUsers(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSearchResults(await res.json());
    } catch { setSearchResults([]); }
  }

  return (
    <div className="space-y-4">
      {detail.employes.map(e => (
        <div key={e.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/20">
          <div className="flex items-center gap-2">
            <span className="text-slate-200">{e.profile?.callsign || e.user_id.slice(0, 8)}</span>
            <span className={`text-xs font-medium ${e.role === 'pdg' ? 'text-amber-400' : e.role === 'technicien' ? 'text-violet-400' : 'text-sky-400'}`}>{e.role}</span>
            {e.specialite && <span className="text-xs text-slate-500">({e.specialite})</span>}
          </div>
          {isPdg && e.role !== 'pdg' && e.user_id !== detail.pdg_id && (
            <button disabled={busy} onClick={async () => {
              try { await api(`/api/reparation/employes?id=${e.id}`, 'DELETE'); flash('Employé licencié'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="text-red-400 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      ))}

      {isPdg && (
        <div className="pt-4 border-t border-slate-700 space-y-2">
          <h4 className="text-sm font-medium text-slate-300">Embaucher un employé</h4>
          <input type="text" value={searchQuery} onChange={e => searchUsers(e.target.value)} placeholder="Rechercher par callsign..." className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
          {searchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded border border-slate-600 bg-slate-800">
              {searchResults.map(u => (
                <button key={u.id} onClick={() => { setSelectedUserId(u.id); setSearchQuery(u.callsign); setSearchResults([]); }} className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">{u.callsign}</button>
              ))}
            </div>
          )}
          <select value={role} onChange={e => setRole(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm">
            <option value="technicien">Technicien</option>
            <option value="logistique">Logistique</option>
          </select>
          <button disabled={busy || !selectedUserId} onClick={async () => {
            try { await api('/api/reparation/employes', 'POST', { entreprise_id: detail.id, user_id: selectedUserId, role }); flash('Employé embauché'); setSelectedUserId(''); setSearchQuery(''); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
          }} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50 flex items-center gap-2"><Plus className="h-4 w-4" />Embaucher</button>
        </div>
      )}
    </div>
  );
}
