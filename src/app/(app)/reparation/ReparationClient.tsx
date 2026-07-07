'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';
import { calculerPrixHangar } from '@/lib/compagnie-utils';
import {
  Wrench, Building2, Users, Warehouse, Tags, ClipboardList,
  Loader2, Plus, Trash2, Check, X, Play, FileText, CreditCard,
  Truck, ParkingSquare, Search, Settings, Maximize2, ArrowRight,
  Star, AlertTriangle, TrendingDown, ChevronDown, BadgePercent,
  Filter, Clock, Edit3, Info
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
  profile: { id: string; identifiant: string; callsign: string | null } | null;
}

interface Hangar {
  id: string;
  aeroport_code: string;
  nom: string | null;
  capacite: number;
  prix_achat?: number;
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
  avion: { id: string; immatriculation: string; nom_bapteme: string | null } | null;
  /** Présent quand statut = en_reparation | mini_jeux : les 4 jeux assignés sont complétés */
  mini_jeux_complets?: boolean;
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
    if (res.ok) {
      setError('');
      setDetail(await res.json());
    }
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
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-orange-500/15 ring-2 ring-orange-500/30 flex items-center justify-center shrink-0">
            <Wrench className="h-6 w-6 text-orange-400 animate-pulse-soft" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Demander une réparation</h1>
            <p className="text-slate-400 mt-1 text-sm">Choisissez une entreprise et un hangar pour envoyer votre avion en réparation.</p>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm animate-fade-in">{error}</p>}
        {success && <p className="text-emerald-400 text-sm animate-fade-in">{success}</p>}

        {!selectedEntId ? (
          <div className="space-y-3 animate-slide-up">
            <h2 className="text-lg font-medium text-slate-200">Sélectionner une entreprise</h2>
            {catalogue.length === 0 ? (
              <p className="text-slate-500">Aucune entreprise de réparation disponible.</p>
            ) : (
              <div className="grid gap-3 stagger-enter">
                {catalogue.map(e => (
                  <button
                    key={e.id}
                    onClick={() => { setSelectedEntId(e.id); setSelectedHangarId(null); }}
                    className="group w-full text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all duration-200 hover:bg-slate-800/50 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-100 group-hover:text-orange-300 transition-colors">{e.nom}</span>
                        {e.description && <p className="text-slate-400 text-sm mt-1 line-clamp-2">{e.description}</p>}
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <Warehouse className="h-3 w-3" />
                          {e.hangars.length} hangar{e.hangars.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      <span className="text-orange-400 text-xl opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
                    </div>
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
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-orange-500/15 ring-2 ring-orange-500/30 flex items-center justify-center shrink-0">
            <Wrench className="h-6 w-6 text-orange-400 animate-pulse-soft" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Mes entreprises</h1>
            <p className="text-slate-400 text-sm mt-1">Sélectionnez une entreprise pour accéder à son tableau de bord.</p>
          </div>
        </div>
        <div className="grid gap-3 stagger-enter">
          {entreprises.map(e => (
            <button
              key={e.id}
              onClick={() => loadDetail(e.id)}
              className="group w-full text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all duration-200 hover:bg-slate-800/50 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="h-5 w-5 text-orange-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-100 group-hover:text-orange-300 transition-colors">{e.nom}</span>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">{e.my_role}</p>
                  </div>
                </div>
                <span className="text-orange-400 text-xl opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
              </div>
            </button>
          ))}
        </div>
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

  const demandesEnCours = detail.demandes.filter(d => !['completee', 'refusee', 'annulee'].includes(d.statut)).length;
  const demandesAvalider = detail.demandes.filter(d => d.statut === 'demandee').length;

  return (
    <div className="space-y-6 animate-fade-in stagger-enter">
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
            className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            ← Voir la liste
          </button>
        </div>
      )}

      {/* === HERO HEADER === */}
      <header className="card overflow-hidden p-0 border-slate-700/60 transition-shadow hover:shadow-xl hover:shadow-orange-500/5">
        <div className="bg-gradient-to-br from-orange-500/10 via-slate-800/10 to-amber-500/10 p-5 sm:p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-14 w-14 rounded-xl bg-orange-500/15 ring-2 ring-orange-500/30 flex items-center justify-center shrink-0">
                <Wrench className="h-7 w-7 text-orange-400 animate-pulse-soft" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 truncate">{detail.nom}</h1>
                {detail.description && <p className="text-slate-400 text-sm mt-0.5 line-clamp-2 max-w-xl">{detail.description}</p>}
              </div>
            </div>
            {isPdg && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                <Settings className="h-3.5 w-3.5" /> PDG
              </span>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-slate-700/40 divide-x divide-slate-700/40">
          {detail.compte && (
            <div className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Solde
              </p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${detail.compte.solde > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {detail.compte.solde.toLocaleString('fr-FR')} <span className="text-sm font-medium">F$</span>
              </p>
              <p className="text-[10px] text-slate-500 font-mono truncate">VBAN: {detail.compte.vban}</p>
            </div>
          )}
          <button type="button" onClick={() => setTab('demandes')} className="p-4 text-left transition-colors hover:bg-orange-500/5">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Demandes
            </p>
            <p className="mt-1 text-xl font-bold text-orange-300 tabular-nums">
              {demandesEnCours}
              {demandesAvalider > 0 && <span className="ml-2 text-xs text-amber-400 animate-pulse">+{demandesAvalider} à valider</span>}
            </p>
            <p className="text-[10px] text-slate-500">en cours · {detail.demandes.length} total</p>
          </button>
          <button type="button" onClick={() => setTab('hangars')} className="p-4 text-left transition-colors hover:bg-orange-500/5">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <Warehouse className="h-3.5 w-3.5" /> Hangars
            </p>
            <p className="mt-1 text-xl font-bold text-sky-300 tabular-nums">{detail.hangars.length}</p>
            <p className="text-[10px] text-slate-500">{detail.hangars.reduce((s, h) => s + h.capacite, 0)} places cumulees</p>
          </button>
          <button type="button" onClick={() => setTab('employes')} className="p-4 text-left transition-colors hover:bg-orange-500/5">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Equipe
            </p>
            <p className="mt-1 text-xl font-bold text-violet-300 tabular-nums">{detail.employes.length}</p>
            <p className="text-[10px] text-slate-500">technicien{detail.employes.length > 1 ? 's' : ''}</p>
          </button>
        </div>
      </header>

      {error && <p className="text-red-400 text-sm animate-fade-in">{error}</p>}
      {success && <p className="text-emerald-400 text-sm animate-fade-in">{success}</p>}

      {/* === NAV TABS PILLS === */}
      <nav className="sticky top-0 z-20 -mx-4 sm:-mx-5 lg:-mx-6 px-4 sm:px-5 lg:px-6 py-2 bg-slate-950/80 backdrop-blur-md border-y border-slate-800/60">
        <div className="flex gap-2 overflow-x-auto scrollbar-thin">
          {tabs.map(t => {
            const Icon = t.icon;
            const count = t.key === 'demandes' ? demandesEnCours : 0;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ring-1 transition-all duration-200 ${
                  isActive
                    ? 'bg-orange-500/20 text-orange-300 ring-orange-400/40 shadow-md shadow-orange-500/10 scale-[1.03]'
                    : 'bg-slate-800/60 text-slate-300 ring-slate-700 hover:bg-slate-700/60 hover:text-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {count > 0 && (
                  <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${isActive ? 'bg-slate-950/60 text-orange-200' : 'bg-orange-600 text-white'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div key={tab} className="card animate-fade-in">
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
  const aValider = active.filter(d => d.statut === 'demandee');
  const tarif = detail.tarifs[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Employés" value={detail.employes.length} icon={<Users className="h-4 w-4 text-violet-400" />} color="violet" />
        <Stat label="Hangars" value={detail.hangars.length} icon={<Warehouse className="h-4 w-4 text-sky-400" />} color="sky" />
        <Stat label="Demandes actives" value={active.length} icon={<ClipboardList className="h-4 w-4 text-orange-400" />} color="orange" badge={aValider.length > 0 ? `+${aValider.length} à valider` : undefined} />
        <Stat label="Solde" value={detail.compte ? `${detail.compte.solde.toLocaleString('fr-FR')} F$` : '—'} icon={<CreditCard className="h-4 w-4 text-emerald-400" />} color="emerald" />
      </div>

      {aValider.length > 0 && (
        <div className="rounded-xl bg-amber-900/20 border border-amber-700/40 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300 text-sm">{aValider.length} demande{aValider.length > 1 ? 's' : ''} en attente de validation</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Acceptez ou refusez les demandes rapidement pour libérer le planning.</p>
          </div>
        </div>
      )}

      {tarif ? (
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
            <Tags className="h-4 w-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Tarif actif</p>
            <p className="text-slate-200 font-semibold">{tarif.prix_par_point.toLocaleString('fr-FR')} F$/point · {tarif.duree_estimee_par_point} min/point</p>
          </div>
          {detail.alliance_reparation_actif && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
              <BadgePercent className="h-3 w-3" /> {detail.prix_alliance_pourcent}% alliance
            </span>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-slate-800/40 border border-dashed border-slate-600/50 p-4 flex items-center gap-3 text-slate-500">
          <Tags className="h-4 w-4 shrink-0" />
          <p className="text-sm">Aucun tarif défini — tarif par défaut appliqué (1 000 F$/point).</p>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" /> Demandes en cours
          </h3>
          <div className="space-y-2">
            {active.slice(0, 5).map(d => {
              const statut = STATUT_LABELS[d.statut];
              return (
                <div key={d.id} className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-3 flex items-center gap-3">
                  <span className="font-mono text-slate-200 text-sm shrink-0">{d.avion?.immatriculation || '?'}</span>
                  <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                  <span className="text-slate-400 text-sm flex-1 truncate">{d.compagnie?.nom || '?'}</span>
                  {d.usure_avant != null && (
                    <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                      <TrendingDown className="h-3 w-3" /> {d.usure_avant}%
                    </div>
                  )}
                  <StatutBadge statut={d.statut} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {active.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-800/20 p-10 text-center">
          <Wrench className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Aucune demande en cours</p>
          <p className="text-slate-500 text-sm mt-1">Les nouvelles demandes apparaîtront ici.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, color, badge }: {
  label: string; value: string | number;
  icon?: React.ReactNode; color?: string; badge?: string;
}) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-500/10 border-violet-700/30',
    sky: 'bg-sky-500/10 border-sky-700/30',
    orange: 'bg-orange-500/10 border-orange-700/30',
    emerald: 'bg-emerald-500/10 border-emerald-700/30',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${color ? colorMap[color] || 'bg-slate-700/30 border-slate-700/30' : 'bg-slate-700/30 border-slate-700/30'}`}>
      {icon && <div className="flex justify-center mb-1.5">{icon}</div>}
      <p className="text-xl font-bold text-slate-100">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {badge && <p className="text-[10px] text-amber-400 mt-0.5 animate-pulse">{badge}</p>}
    </div>
  );
}

function StatutBadge({ statut }: { statut: string }) {
  const bgMap: Record<string, string> = {
    demandee:      'bg-amber-500/20 text-amber-300 border-amber-500/30',
    acceptee:      'bg-sky-500/20 text-sky-300 border-sky-500/30',
    en_transit:    'bg-sky-400/20 text-sky-200 border-sky-400/30',
    en_reparation: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    mini_jeux:     'bg-violet-400/20 text-violet-200 border-violet-400/30',
    terminee:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    facturee:      'bg-amber-400/20 text-amber-200 border-amber-400/30',
    payee:         'bg-emerald-400/20 text-emerald-200 border-emerald-400/30',
    retour_transit:'bg-sky-300/20 text-sky-200 border-sky-300/30',
    completee:     'bg-emerald-600/20 text-emerald-200 border-emerald-600/30',
    refusee:       'bg-red-500/20 text-red-300 border-red-500/30',
    annulee:       'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${bgMap[statut] || 'bg-slate-700/30 text-slate-400 border-slate-600/30'}`}>
      {STATUT_LABELS[statut]?.label || statut}
    </span>
  );
}

type DemandeFiltre = 'tous' | 'a_valider' | 'en_cours' | 'archives';

function DemandesTab({ detail, api, flash, busy, onRefresh, router }: {
  detail: Detail; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [filtre, setFiltre] = useState<DemandeFiltre>('a_valider');
  const tarif = detail.tarifs[0];

  const demandesParFiltre: Record<DemandeFiltre, Demande[]> = {
    tous:      detail.demandes,
    a_valider: detail.demandes.filter(d => d.statut === 'demandee'),
    en_cours:  detail.demandes.filter(d => !['completee', 'refusee', 'annulee', 'demandee'].includes(d.statut)),
    archives:  detail.demandes.filter(d => ['completee', 'refusee', 'annulee'].includes(d.statut)),
  };
  const demandes = demandesParFiltre[filtre];

  async function doAction(demandeId: string, action: string, extra?: Record<string, unknown>) {
    try {
      await api(`/api/reparation/demandes/${demandeId}`, 'PATCH', { action, ...extra });
      flash(`Action "${action}" effectuée`);
      onRefresh();
    } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
  }

  const filtres: { key: DemandeFiltre; label: string; count: number }[] = [
    { key: 'a_valider', label: 'À valider', count: demandesParFiltre.a_valider.length },
    { key: 'en_cours',  label: 'En cours',  count: demandesParFiltre.en_cours.length },
    { key: 'tous',      label: 'Tout',       count: detail.demandes.length },
    { key: 'archives',  label: 'Archives',   count: demandesParFiltre.archives.length },
  ];

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        {filtres.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltre(f.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 transition-all ${
              filtre === f.key
                ? 'bg-orange-500/20 text-orange-300 ring-orange-400/40'
                : 'bg-slate-800/40 text-slate-400 ring-slate-700 hover:text-slate-200'
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className={`min-w-[16px] h-4 text-center px-1 rounded-full text-[10px] font-bold ${
                filtre === f.key ? 'bg-slate-950/50 text-orange-200' : 'bg-slate-700 text-slate-300'
              }`}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {demandes.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-800/20 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">
            {filtre === 'a_valider' ? 'Aucune demande en attente' :
             filtre === 'en_cours' ? 'Aucune réparation en cours' :
             filtre === 'archives' ? 'Aucun historique' : 'Aucune demande'}
          </p>
          {filtre === 'a_valider' && <p className="text-slate-500 text-sm mt-1">Toutes les demandes ont été traitées.</p>}
        </div>
      )}

      {demandes.map(d => {
        const prixEstime = tarif && d.usure_avant != null
          ? d.usure_avant * tarif.prix_par_point
          : null;

        return (
          <div key={d.id} className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden transition-shadow hover:shadow-lg hover:shadow-orange-500/5">
            {/* Header carte */}
            <div className="p-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-slate-700/50 flex items-center justify-center shrink-0">
                  <Wrench className="h-5 w-5 text-orange-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-100">{d.avion?.immatriculation || '?'}</span>
                    <span className="text-slate-400 text-sm truncate">{d.compagnie?.nom || '?'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(d.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
              <StatutBadge statut={d.statut} />
            </div>

            {/* Usure progress */}
            {d.usure_avant != null && (
              <div className="px-4 pb-2 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Usure</span>
                  <span>
                    {d.usure_avant}%{d.usure_apres != null ? ` → ${d.usure_apres}%` : ''}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500 transition-all"
                    style={{ width: `${d.usure_avant}%` }}
                  />
                </div>
                {d.usure_apres != null && (
                  <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden -mt-1.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                      style={{ width: `${d.usure_apres}%`, opacity: 0.6 }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Prix */}
            <div className="px-4 pb-3 flex items-center gap-4 flex-wrap text-xs text-slate-400">
              {d.prix_total != null ? (
                <span className="text-emerald-400 font-semibold">{d.prix_total.toLocaleString('fr-FR')} F$</span>
              ) : prixEstime != null ? (
                <span className="text-slate-500">~{prixEstime.toLocaleString('fr-FR')} F$ estimé</span>
              ) : null}
              {d.score_qualite != null && (
                <span className={`font-semibold ${d.score_qualite >= 80 ? 'text-emerald-400' : d.score_qualite >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  Score : {d.score_qualite}/100
                </span>
              )}
            </div>

            {d.commentaire_compagnie && (
              <div className="mx-4 mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-700/30 text-xs text-slate-400">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-500" />
                {d.commentaire_compagnie}
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-slate-700/30 px-4 py-3 flex gap-2 flex-wrap">
              {d.statut === 'demandee' && (
                <>
                  <button disabled={busy} onClick={() => doAction(d.id, 'accepter')}
                    className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1 transition-colors">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Accepter
                  </button>
                  <button disabled={busy} onClick={() => doAction(d.id, 'refuser')}
                    className="px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                    <X className="h-3 w-3" />Refuser
                  </button>
                </>
              )}
              {d.statut === 'acceptee' && (
                <button disabled={busy} onClick={() => doAction(d.id, 'ferry_arrive')}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}Confirmer arrivée au hangar
                </button>
              )}
              {d.statut === 'en_transit' && (
                <button disabled={busy} onClick={() => doAction(d.id, 'ferry_arrive')}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}Avion arrivé au hangar
                </button>
              )}
              {d.statut === 'en_reparation' && (
                <button disabled={busy} onClick={() => router.push(`/reparation/jeu/${d.id}`)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                  <Play className="h-3 w-3" />Jouer les mini-jeux
                </button>
              )}
              {d.statut === 'mini_jeux' && (
                <>
                  <button disabled={busy} onClick={() => router.push(`/reparation/jeu/${d.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-violet-600/60 hover:bg-violet-600 text-violet-200 text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                    <Play className="h-3 w-3" />Continuer les jeux
                  </button>
                  {d.mini_jeux_complets ? (
                    <button disabled={busy} onClick={() => doAction(d.id, 'terminer')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Terminer réparation
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500 w-full">Complétez les 4 mini-jeux assignés avant de terminer.</p>
                  )}
                </>
              )}
              {d.statut === 'terminee' && (
                <button disabled={busy} onClick={() => doAction(d.id, 'facturer')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}Facturer
                </button>
              )}
              {d.statut === 'payee' && (
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => doAction(d.id, 'completer', { livraison: 'parking' })}
                    className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                    <ParkingSquare className="h-3 w-3" />Parking
                  </button>
                  <button disabled={busy} onClick={() => doAction(d.id, 'completer', { livraison: 'ferry' })}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors">
                    <Truck className="h-3 w-3" />Transit vers la base
                  </button>
                </div>
              )}
              {d.statut === 'retour_transit' && (
                <p className="text-xs text-sky-400">
                  Transit automatique en cours vers l&apos;aéroport d&apos;origine du client.
                </p>
              )}
              {!['completee', 'refusee', 'annulee', 'facturee', 'payee', 'retour_transit'].includes(d.statut) && (
                <button disabled={busy} onClick={() => doAction(d.id, 'annuler')}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-400 text-xs transition-colors">
                  Annuler
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const AEROPORTS_TRIES = [...AEROPORTS_VOL_CIVIL].sort((a, b) => a.code.localeCompare(b.code));

function HangarsTab({ detail, isPdg, api, flash, busy, onRefresh }: {
  detail: Detail; isPdg: boolean; api: (u: string, m: string, b?: unknown) => Promise<unknown>;
  flash: (m: string, e?: boolean) => void; busy: boolean; onRefresh: () => void;
}) {
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [capacite, setCapacite] = useState('2');
  const [agrandirId, setAgrandirId] = useState<string | null>(null);
  const [nbPlaces, setNbPlaces] = useState('1');

  const aeroportsDisponibles = useMemo(() => {
    const codesExistants = new Set(detail.hangars.map(h => h.aeroport_code));
    return AEROPORTS_TRIES.filter(a => !codesExistants.has(a.code));
  }, [detail.hangars]);

  const base = detail.prix_hangar_base ?? 500000;
  const mult = detail.prix_hangar_multiplicateur ?? 2;
  const cap = Math.max(1, Math.min(20, Number(capacite) || 2));
  const prixProchain = calculerPrixHangar(detail.hangars.length + 1, cap, base, mult);
  const prixParPlace = Math.max(10000, Math.floor(base / 5));

  const hangarAgrandir = agrandirId ? detail.hangars.find(h => h.id === agrandirId) : null;
  const nbPlacesNum = Math.max(1, Math.min(hangarAgrandir ? 20 - hangarAgrandir.capacite : 19, Number(nbPlaces) || 1));
  const prixAgrandir = prixParPlace * nbPlacesNum;

  return (
    <div className="space-y-3">
      {detail.hangars.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-800/20 p-8 text-center">
          <Warehouse className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Aucun hangar</p>
          <p className="text-slate-500 text-sm mt-1">Le premier hangar est gratuit.</p>
        </div>
      )}

      {detail.hangars.map(h => (
        <div key={h.id} className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                <Warehouse className="h-4 w-4 text-sky-400" />
              </div>
              <div>
                <span className="font-mono font-bold text-slate-200">{h.aeroport_code}</span>
                {h.nom && <span className="text-slate-400 text-sm ml-2">— {h.nom}</span>}
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>{h.capacite} place{h.capacite > 1 ? 's' : ''}</span>
                  {h.capacite < 20 && <span className="text-slate-600">· max 20</span>}
                  {h.capacite >= 20 && <span className="text-emerald-600 font-semibold">Plein</span>}
                </div>
              </div>
            </div>
            {/* Barre capacité */}
            <div className="hidden sm:flex flex-col gap-1 w-24">
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${(h.capacite / 20) * 100}%` }} />
              </div>
              <span className="text-[10px] text-slate-600 text-right">{h.capacite}/20</span>
            </div>
            {isPdg && (
              <div className="flex items-center gap-1 shrink-0">
                {h.capacite < 20 && (
                  <button
                    disabled={busy}
                    onClick={() => { setAgrandirId(agrandirId === h.id ? null : h.id); setNbPlaces('1'); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                      agrandirId === h.id
                        ? 'bg-sky-600 text-white'
                        : 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30'
                    }`}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Agrandir
                  </button>
                )}
                <button disabled={busy} onClick={async () => {
                  try { await api(`/api/reparation/hangars?id=${h.id}`, 'DELETE'); flash('Hangar supprimé'); onRefresh(); }
                  catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                }} className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Panel Agrandir */}
          {agrandirId === h.id && (
            <div className="border-t border-sky-700/30 bg-sky-900/10 px-4 py-3 space-y-3">
              <div className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4 text-sky-400" />
                <span className="text-sm font-semibold text-sky-300">Agrandir le hangar</span>
              </div>
              <p className="text-xs text-slate-400">
                Prix : <span className="text-sky-300 font-semibold">{prixParPlace.toLocaleString('fr-FR')} F$ / place</span>
                {' '}· Places disponibles : {20 - h.capacite}
              </p>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Places à ajouter</label>
                  <input
                    type="number" min="1" max={20 - h.capacite}
                    value={nbPlaces}
                    onChange={e => setNbPlaces(e.target.value)}
                    className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-24 text-sm"
                  />
                </div>
                <div className="pb-0.5">
                  <p className="text-xs text-slate-500 mb-1">Total à débiter</p>
                  <p className="text-lg font-bold text-sky-300">{prixAgrandir.toLocaleString('fr-FR')} F$</p>
                </div>
                <div className="flex gap-2 items-end pb-0.5">
                  <button
                    disabled={busy || nbPlacesNum < 1 || h.capacite >= 20}
                    onClick={async () => {
                      try {
                        const res = await api(`/api/reparation/hangars/${h.id}/agrandir`, 'PATCH', { nb_places_ajoutees: nbPlacesNum }) as { capacite?: number; prix_paye?: number };
                        flash(`Hangar agrandi : ${res.capacite} places (${(res.prix_paye ?? prixAgrandir).toLocaleString('fr-FR')} F$ débités)`);
                        setAgrandirId(null);
                        onRefresh();
                      } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                    }}
                    className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Maximize2 className="h-4 w-4" />}
                    Confirmer
                  </button>
                  <button onClick={() => setAgrandirId(null)} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm transition-colors hover:bg-slate-600">
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {isPdg && (
        <div className="pt-2 border-t border-slate-700/40 space-y-3">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Plus className="h-4 w-4 text-orange-400" /> Ajouter un hangar
          </h4>
          <p className="text-xs text-slate-400">
            Prix prochain hangar : <span className={`font-semibold ${prixProchain === 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
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
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom (opt.)" className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 flex-1 min-w-[120px] text-sm" />
            <input type="number" min="1" max="20" value={capacite} onChange={e => setCapacite(e.target.value)} placeholder="Cap." className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-20 text-sm" />
            <button
              disabled={busy || !code.trim()}
              onClick={async () => {
                try {
                  const res = await api('/api/reparation/hangars', 'POST', { entreprise_id: detail.id, aeroport_code: code.trim(), nom: nom.trim() || undefined, capacite: Number(capacite) || 2 }) as { ok?: boolean; prix?: number };
                  flash(prixProchain > 0 ? `Hangar ajouté (${(res?.prix ?? prixProchain).toLocaleString('fr-FR')} F$)` : 'Premier hangar ajouté gratuitement');
                  setCode(''); setNom(''); onRefresh();
                } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
              }}
              className="px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Ajouter
            </button>
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
  const tarifExistant = detail.tarifs[0] ?? null;

  const [prix, setPrix] = useState(String(tarifExistant?.prix_par_point ?? 1000));
  const [duree, setDuree] = useState(String(tarifExistant?.duree_estimee_par_point ?? 2));

  // Sync if detail refreshed
  const tarifId = tarifExistant?.id;
  useEffect(() => {
    setPrix(String(tarifExistant?.prix_par_point ?? 1000));
    setDuree(String(tarifExistant?.duree_estimee_par_point ?? 2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifId]);

  const prixNum = Number(prix) || 1000;
  const dureeNum = Number(duree) || 2;

  return (
    <div className="space-y-5">
      {/* Tarif actif */}
      {tarifExistant ? (
        <div className="rounded-xl bg-orange-500/8 border border-orange-500/20 p-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
            <Tags className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Tarif de base actif</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Unique par entreprise</span>
            </div>
            <p className="text-xl font-bold text-slate-100 mt-1">
              {tarifExistant.prix_par_point.toLocaleString('fr-FR')} <span className="text-sm font-normal text-slate-400">F$ / point d&apos;usure</span>
            </p>
            <p className="text-sm text-slate-400 mt-0.5">{tarifExistant.duree_estimee_par_point} min / point · durée estimée</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-800/40 border border-dashed border-slate-600/50 p-4 flex items-center gap-3 text-slate-500">
          <Tags className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm text-slate-400 font-medium">Aucun tarif défini</p>
            <p className="text-xs mt-0.5">Le tarif par défaut (1 000 F$/point) sera appliqué jusqu&apos;à ce que vous en définissiez un.</p>
          </div>
        </div>
      )}

      {/* Réduction alliance */}
      {detail.alliance_reparation_actif && (
        <div className="rounded-xl bg-sky-900/20 border border-sky-700/30 p-3 flex items-center gap-3">
          <BadgePercent className="h-4 w-4 text-sky-400 shrink-0" />
          <div className="text-sm">
            <span className="text-sky-300 font-semibold">{detail.prix_alliance_pourcent}%</span>
            <span className="text-slate-400 ml-1">du tarif normal pour les membres alliance — s&apos;applique EN PLUS du tarif de base ci-dessus.</span>
          </div>
        </div>
      )}

      {/* Exemple de calcul */}
      {tarifExistant && (
        <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-4 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Exemple de calcul
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <div>
              <span className="text-slate-500">Avion 50% d&apos;usure → 0% : </span>
              <span className="font-semibold text-amber-300">{(50 * tarifExistant.prix_par_point).toLocaleString('fr-FR')} F$</span>
            </div>
            {detail.alliance_reparation_actif && (
              <div>
                <span className="text-slate-500">Avec alliance {detail.prix_alliance_pourcent}% : </span>
                <span className="font-semibold text-sky-300">{Math.round(50 * tarifExistant.prix_par_point * ((detail.prix_alliance_pourcent ?? 80) / 100)).toLocaleString('fr-FR')} F$</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulaire PDG */}
      {isPdg && (
        <div className="pt-3 border-t border-slate-700/40 space-y-3">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            {tarifExistant ? <><Edit3 className="h-4 w-4 text-orange-400" /> Modifier le tarif</> : <><Plus className="h-4 w-4 text-orange-400" /> Définir le tarif</>}
          </h4>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">F$ par point d&apos;usure</label>
              <input
                type="number" min="0" value={prix}
                onChange={e => setPrix(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-36 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Min. par point</label>
              <input
                type="number" min="1" value={duree}
                onChange={e => setDuree(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-28 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    await api('/api/reparation/tarifs', 'PATCH', {
                      entreprise_id: detail.id,
                      prix_par_point: prixNum,
                      duree_estimee_par_point: dureeNum,
                    });
                    flash(tarifExistant ? 'Tarif modifié' : 'Tarif créé');
                    onRefresh();
                  } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                }}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tarifExistant ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {tarifExistant ? 'Enregistrer' : 'Créer le tarif'}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Aperçu : 50 points d&apos;usure = <span className="text-amber-300">{(50 * prixNum).toLocaleString('fr-FR')} F$</span>
            {' '}· durée estimée {50 * dureeNum} min
          </p>
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
  const [identifiantInput, setIdentifiantInput] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; identifiant: string; callsign: string | null }[]>([]);
  const [role, setRole] = useState('technicien');

  async function searchUsers(q: string) {
    setIdentifiantInput(q);
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSuggestions(await res.json());
    } catch { setSuggestions([]); }
  }

  return (
    <div className="space-y-4">
      {detail.employes.map(e => (
        <div key={e.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/20">
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-mono">{e.profile?.identifiant || e.user_id.slice(0, 8)}</span>
            {e.profile?.callsign && <span className="text-xs text-slate-400">({e.profile.callsign})</span>}
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
          <div className="relative">
            <input type="text" value={identifiantInput} onChange={e => searchUsers(e.target.value)} placeholder="Identifiant du joueur..." className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm font-mono" />
            {suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 max-h-32 overflow-y-auto rounded border border-slate-600 bg-slate-800 shadow-lg">
                {suggestions.map(u => (
                  <button key={u.id} onClick={() => { setIdentifiantInput(u.identifiant); setSuggestions([]); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-700 flex items-center gap-2">
                    <span className="text-slate-200 font-mono">{u.identifiant}</span>
                    {u.callsign && <span className="text-xs text-slate-400">({u.callsign})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={role} onChange={e => setRole(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm">
            <option value="technicien">Technicien</option>
            <option value="logistique">Logistique</option>
          </select>
          <button disabled={busy || !identifiantInput.trim()} onClick={async () => {
            try { await api('/api/reparation/employes', 'POST', { entreprise_id: detail.id, identifiant: identifiantInput.trim(), role }); flash('Employé embauché'); setIdentifiantInput(''); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
          }} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50 flex items-center gap-2"><Plus className="h-4 w-4" />Embaucher</button>
        </div>
      )}
    </div>
  );
}
