'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Building2, Crown, Settings, Landmark, Loader2,
  Megaphone, Plane, Wallet, ShieldCheck, UserMinus, ArrowRightLeft,
  Send, HandCoins, Star, Check, X, ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react';

interface Parametres {
  codeshare_actif: boolean;
  codeshare_pourcent: number;
  taxe_alliance_actif: boolean;
  taxe_alliance_pourcent: number;
  transfert_avions_actif: boolean;
  pret_avions_actif: boolean;
  don_avions_actif: boolean;
  partage_hubs_actif: boolean;
}

interface Membre {
  id: string;
  compagnie_id: string;
  role: string;
  joined_at: string;
  codeshare_pourcent: number;
  compagnie: { id: string; nom: string } | null;
}

interface Alliance {
  id: string;
  nom: string;
  description?: string;
  logo_url?: string;
  devise?: string;
  created_at: string;
  created_by_compagnie_id: string;
  parametres: Parametres | null;
  nb_membres?: number;
  my_compagnie_id: string | null;
  my_compagnie_nom?: string | null;
  my_compagnie_ids?: string[];
  my_compagnie_noms?: string[];
  my_role: string | null;
}

interface Annonce {
  id: string;
  titre: string;
  contenu: string;
  important: boolean;
  created_at: string;
  auteur_id: string;
}

interface Transfert {
  id: string;
  type_transfert: string;
  compagnie_avion_id: string;
  compagnie_source_id: string;
  compagnie_dest_id: string | null;
  prix: number | null;
  duree_jours: number | null;
  statut: string;
  created_at: string;
  avion_label?: string | null;
  avion_immat?: string;
  avion_type?: string;
}

interface DemandeFonds {
  id: string;
  compagnie_id: string;
  montant: number;
  motif: string;
  statut: string;
  created_at: string;
}

interface Contribution {
  id: string;
  compagnie_id: string;
  montant: number;
  libelle: string;
  created_at: string;
  compagnie_nom?: string | null;
}

interface Invitation {
  id: string;
  compagnie_id: string;
  statut: string;
  message: string | null;
  compagnie: { id: string; nom: string } | null;
}

interface AllianceDetail extends Alliance {
  membres: Membre[];
  compte_alliance: { id: string; vban: string; solde: number } | null;
  annonces: Annonce[];
  invitations_en_attente: Invitation[];
  transferts: Transfert[];
  demandes_fonds: DemandeFonds[];
  contributions: Contribution[];
  my_compagnie_ids?: string[];
}

interface Props {
  compagniesSansAlliance: { id: string; nom: string }[];
  pdgCompagnieIds: string[];
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: Star },
  { key: 'membres', label: 'Membres', icon: Users },
  { key: 'flotte', label: 'Flotte', icon: Plane },
  { key: 'finances', label: 'Finances', icon: Wallet },
  { key: 'annonces', label: 'Annonces', icon: Megaphone },
  { key: 'parametres', label: 'Paramètres', icon: Settings },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const ROLE_LABELS: Record<string, string> = {
  president: 'Président',
  vice_president: 'Vice-Président',
  secretaire: 'Secrétaire',
  membre: 'Membre',
};
const ROLE_COLORS: Record<string, string> = {
  president: 'text-amber-400',
  vice_president: 'text-sky-400',
  secretaire: 'text-emerald-400',
  membre: 'text-slate-400',
};

export default function AllianceClient({ compagniesSansAlliance, pdgCompagnieIds }: Props) {
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AllianceDetail | null>(null);
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const isLeader = detail?.my_role === 'president' || detail?.my_role === 'vice_president';
  const isPresident = detail?.my_role === 'president';

  useEffect(() => {
    fetch('/api/alliances').then(r => r.json()).then(d => setAlliances(Array.isArray(d) ? d : [])).catch(() => setAlliances([])).finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/alliances/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDetail(data);
  }, []);

  useEffect(() => {
    if (alliances.length === 1 && !detail) loadDetail(alliances[0].id);
  }, [alliances, detail, loadDetail]);

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  }

  async function api(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      return data;
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  if (!detail && alliances.length === 0) {
    return (
      <div className="space-y-8">
        <Header />
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}
        <p className="text-slate-500">Vous n&apos;êtes dans aucune alliance. Un administrateur peut en créer une, ou un président peut vous inviter.</p>
        <PendingInvitations pdgCompagnieIds={pdgCompagnieIds} onAccepted={async (allianceId) => {
          const res = await fetch('/api/alliances');
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setAlliances(list);
          if (allianceId) {
            await loadDetail(allianceId);
          } else if (list.length === 1) {
            await loadDetail(list[0].id);
          }
        }} />
      </div>
    );
  }

  if (!detail && alliances.length > 0) {
    return (
      <div className="space-y-8">
        <Header />
        <PendingInvitations pdgCompagnieIds={pdgCompagnieIds} onAccepted={async (allianceId) => {
          const res = await fetch('/api/alliances');
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setAlliances(list);
          if (allianceId) await loadDetail(allianceId);
        }} />
        {alliances.map(a => (
          <button key={a.id} onClick={() => loadDetail(a.id)} className="w-full text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 hover:bg-slate-800/50 transition flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-100">{a.nom}</span>
              <span className="ml-2 text-xs text-slate-500">{a.nb_membres} membre{(a.nb_membres || 0) > 1 ? 's' : ''}</span>
              {(a.my_compagnie_noms?.length ?? 0) > 0 && (
                <span className="block text-xs text-slate-500 mt-0.5">via {a.my_compagnie_noms?.join(', ') ?? a.my_compagnie_nom}</span>
              )}
            </div>
            <span className={`text-sm ${ROLE_COLORS[a.my_role || ''] || 'text-slate-400'}`}>{ROLE_LABELS[a.my_role || ''] || a.my_role}</span>
          </button>
        ))}
      </div>
    );
  }

  if (!detail) return null;

  const mesCompagniesDansAlliance = (detail.my_compagnie_ids?.length ?? 0) > 0
    ? detail.membres.filter(m => detail.my_compagnie_ids!.includes(m.compagnie_id))
    : [];

  return (
    <div className="space-y-6">
      {alliances.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">Alliance :</span>
          <select
            value={detail.id}
            onChange={(e) => loadDetail(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm font-medium"
          >
            {alliances.map(a => (
              <option key={a.id} value={a.id}>
                {a.nom}
                {(a.my_compagnie_noms?.length ?? 0) > 0 ? ` (via ${a.my_compagnie_noms?.join(', ')})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="h-7 w-7 text-violet-400" />
            {detail.nom}
          </h1>
          {detail.description && <p className="text-slate-400 mt-1">{detail.description}</p>}
          {detail.devise && <p className="text-slate-500 text-sm italic">&laquo; {detail.devise} &raquo;</p>}
          {mesCompagniesDansAlliance.length > 1 && (
            <p className="text-xs text-sky-400/90 mt-1 flex items-center gap-1">Vos compagnies : {mesCompagniesDansAlliance.map(m => m.compagnie?.nom).join(', ')}</p>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${ROLE_COLORS[detail.my_role || ''] || ''} bg-slate-800`}>
          {ROLE_LABELS[detail.my_role || ''] || detail.my_role}
        </span>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-700 pb-px">
        {TABS.filter(t => t.key !== 'parametres' || isLeader || detail.my_role === 'admin').map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition ${tab === t.key ? 'bg-slate-800 text-violet-400 border-b-2 border-violet-400' : 'text-slate-400 hover:text-slate-200'}`}>
              <Icon className="h-4 w-4" />{t.label}
            </button>
          );
        })}
      </nav>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        {tab === 'dashboard' && <DashboardTab detail={detail} />}
        {tab === 'membres' && <MembresTab detail={detail} isPresident={!!isPresident} isLeader={!!isLeader} onRefresh={() => loadDetail(detail.id)} flash={flash} api={api} busy={busy} compagniesSansAlliance={compagniesSansAlliance} />}
        {tab === 'flotte' && <FlotteTab detail={detail} pdgCompagnieIds={pdgCompagnieIds} onRefresh={() => loadDetail(detail.id)} flash={flash} api={api} busy={busy} />}
        {tab === 'finances' && <FinancesTab detail={detail} isLeader={!!isLeader} isPdg={pdgCompagnieIds.some(id => detail.membres.some(m => m.compagnie_id === id))} pdgCompagnieIds={pdgCompagnieIds} onRefresh={() => loadDetail(detail.id)} flash={flash} api={api} busy={busy} />}
        {tab === 'annonces' && <AnnoncesTab detail={detail} isLeader={!!isLeader} onRefresh={() => loadDetail(detail.id)} flash={flash} api={api} busy={busy} />}
        {tab === 'parametres' && <ParametresTab detail={detail} onRefresh={() => loadDetail(detail.id)} flash={flash} api={api} busy={busy} />}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Users className="h-7 w-7 text-violet-400" />Alliance</h1>
      <p className="text-slate-400 mt-1">Créez ou rejoignez une alliance pour collaborer entre compagnies.</p>
    </div>
  );
}

function Alert({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  return <p className={`text-sm ${type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{children}</p>;
}

function PendingInvitations({ pdgCompagnieIds, onAccepted }: { pdgCompagnieIds: string[]; onAccepted: (allianceId: string) => void }) {
  const [invites, setInvites] = useState<Array<{ id: string; alliance_id: string; alliance_nom: string; message: string | null }>>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [busy, setBusy] = useState(false);
  const [respondError, setRespondError] = useState('');

  useEffect(() => {
    if (pdgCompagnieIds.length === 0) { setLoadingInvites(false); return; }
    setLoadingInvites(true);
    fetch('/api/alliances/invitations-pending')
      .then(r => r.ok ? r.json() : [])
      .then(d => setInvites(Array.isArray(d) ? d : []))
      .catch(() => setInvites([]))
      .finally(() => setLoadingInvites(false));
  }, [pdgCompagnieIds]);

  if (loadingInvites) return null;
  if (invites.length === 0) return null;

  async function respond(invId: string, allianceId: string, action: string) {
    setBusy(true);
    setRespondError('');
    try {
      const res = await fetch(`/api/alliances/${allianceId}/invitations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: invId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRespondError(data.error || 'Erreur lors du traitement');
        return;
      }
      setInvites(prev => prev.filter(i => i.id !== invId));
      if (action === 'accepter') onAccepted(allianceId);
    } catch {
      setRespondError('Erreur de connexion');
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border-2 border-amber-500/60 bg-gradient-to-b from-amber-900/20 to-amber-900/5 p-6 shadow-lg shadow-amber-500/10">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-amber-500/20 animate-pulse">
          <Send className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-amber-300">Invitations en attente</h2>
          <p className="text-xs text-slate-400">Vous avez {invites.length} invitation{invites.length > 1 ? 's' : ''} d&apos;alliance</p>
        </div>
      </div>
      {respondError && <p className="text-red-400 text-sm mb-2">{respondError}</p>}
      <div className="space-y-3">
        {invites.map(inv => (
          <div key={inv.id} className="flex items-center justify-between flex-wrap gap-3 py-3 px-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div>
              <span className="text-slate-200 font-semibold text-base">{inv.alliance_nom}</span>
              {inv.message && <p className="text-slate-400 text-sm mt-0.5">{inv.message}</p>}
            </div>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => respond(inv.id, inv.alliance_id, 'accepter')} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"><Check className="h-4 w-4" />Accepter</button>
              <button disabled={busy} onClick={() => respond(inv.id, inv.alliance_id, 'refuser')} className="px-4 py-2 rounded-lg bg-red-600/40 hover:bg-red-600/60 text-red-200 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 transition"><X className="h-4 w-4" />Refuser</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardTab({ detail }: { detail: AllianceDetail }) {
  const president = detail.membres.find(m => m.role === 'president');
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Membres" value={detail.membres.length} />
        <StatCard label="Annonces" value={detail.annonces.length} />
        <StatCard label="Transferts" value={detail.transferts.length} />
        {detail.compte_alliance && <StatCard label="Solde" value={`${detail.compte_alliance.solde.toLocaleString('fr-FR')} F$`} />}
      </div>

      {president && (
        <div className="flex items-center gap-2 text-slate-300">
          <Crown className="h-5 w-5 text-amber-400" />
          <span>Président : <strong>{president.compagnie?.nom || 'Inconnu'}</strong></span>
        </div>
      )}

      {detail.annonces.filter(a => a.important).length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2 flex items-center gap-2"><Megaphone className="h-4 w-4 text-amber-400" />Annonces importantes</h3>
          {detail.annonces.filter(a => a.important).slice(0, 3).map(a => (
            <div key={a.id} className="p-3 rounded-lg bg-amber-900/20 border border-amber-700/30 mb-2">
              <p className="font-medium text-amber-200">{a.titre}</p>
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{a.contenu}</p>
              <p className="text-slate-500 text-xs mt-1">{new Date(a.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="font-medium text-slate-200 mb-2">Membres</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {detail.membres.map(m => (
            <div key={m.id} className="flex items-center gap-2 py-1">
              <Building2 className="h-4 w-4 text-slate-500" />
              <span className="text-slate-200">{m.compagnie?.nom || m.compagnie_id}</span>
              <span className={`text-xs ${ROLE_COLORS[m.role] || 'text-slate-500'}`}>{ROLE_LABELS[m.role] || m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-700/30 p-3 text-center">
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function MembresTab({ detail, isPresident, isLeader, onRefresh, flash, api, busy, compagniesSansAlliance }: {
  detail: AllianceDetail; isPresident: boolean; isLeader: boolean;
  onRefresh: () => void; flash: (m: string, e?: boolean) => void;
  api: (u: string, m: string, b?: unknown) => Promise<unknown>; busy: boolean;
  compagniesSansAlliance: { id: string; nom: string }[];
}) {
  const [invCompId, setInvCompId] = useState('');
  const [invMsg, setInvMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; nom: string }[]>([]);

  async function searchCompagnies(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/compagnies/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      }
    } catch { setSearchResults([]); }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-slate-200">Membres ({detail.membres.length})</h3>
      <div className="space-y-2">
        {detail.membres.map(m => {
          const roleIcon = m.role === 'president' ? <Crown className="h-3.5 w-3.5 text-amber-400" />
            : m.role === 'vice_president' ? <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
            : null;
          return (
            <div key={m.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-slate-700/20">
              <div className="flex items-center gap-2">
                {roleIcon || <Building2 className="h-4 w-4 text-slate-500" />}
                <span className="text-slate-200 font-medium">{m.compagnie?.nom || m.compagnie_id}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[m.role] || ''} bg-slate-700/50`}>{ROLE_LABELS[m.role] || m.role}</span>
              </div>
              {isPresident && m.role !== 'president' && (
                <div className="flex gap-1.5 items-center">
                  <select onChange={async (e) => {
                    if (!e.target.value) return;
                    const roleName = ROLE_LABELS[e.target.value] || e.target.value;
                    if (!confirm(`Nommer ${m.compagnie?.nom} comme ${roleName} ?`)) { e.target.value = ''; return; }
                    try { await api(`/api/alliances/${detail.id}/membres`, 'PATCH', { action: 'changer_role', membre_id: m.id, nouveau_role: e.target.value }); flash(`${m.compagnie?.nom} est maintenant ${roleName}`); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                    e.target.value = '';
                  }} className="text-xs rounded border border-slate-600 bg-slate-800 text-slate-300 px-1.5 py-1" defaultValue="">
                    <option value="">Changer le rôle...</option>
                    {['vice_president', 'secretaire', 'membre'].filter(r => r !== m.role).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button disabled={busy} onClick={async () => {
                    if (!confirm(`Expulser ${m.compagnie?.nom} de l'alliance ?`)) return;
                    try { await api(`/api/alliances/${detail.id}/membres`, 'PATCH', { action: 'expulser', membre_id: m.id }); flash('Membre expulsé'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                  }} className="text-xs px-2 py-1 rounded bg-red-600/30 text-red-300 hover:bg-red-600/50 disabled:opacity-50" title="Expulser">
                    <UserMinus className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isPresident && (
        <div className="pt-4 border-t border-amber-700/30">
          <h4 className="text-sm font-medium text-amber-300 mb-1 flex items-center gap-1.5">
            <Crown className="h-4 w-4" /> Transférer la présidence
          </h4>
          <p className="text-xs text-slate-500 mb-3">Vous deviendrez Vice-Président après le transfert. Tous les membres de l&apos;alliance seront notifiés.</p>
          <div className="flex gap-2 flex-wrap">
            {detail.membres.filter(m => m.role !== 'president').map(m => (
              <button key={m.id} disabled={busy} onClick={async () => {
                if (!confirm(`⚠️ Transférer la présidence à ${m.compagnie?.nom} ?\n\nVous deviendrez Vice-Président. Cette action est irréversible sans l'accord du nouveau Président.`)) return;
                try { await api(`/api/alliances/${detail.id}/membres`, 'PATCH', { action: 'transferer_presidence', membre_id: m.id }); flash('Présidence transférée avec succès'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
              }} className="px-3 py-1.5 text-xs rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 disabled:opacity-50 border border-amber-700/30 transition">
                <Crown className="h-3 w-3 inline mr-1" />{m.compagnie?.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLeader && (
        <div className="pt-4 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-2">Inviter une compagnie</h4>
          <div className="space-y-2">
            <input type="text" value={searchQuery} onChange={e => searchCompagnies(e.target.value)} placeholder="Rechercher une compagnie..." className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
            {searchResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border border-slate-600 bg-slate-800">
                {searchResults.map(c => (
                  <button key={c.id} onClick={() => { setInvCompId(c.id); setSearchQuery(c.nom); setSearchResults([]); }} className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">{c.nom}</button>
                ))}
              </div>
            )}
            {compagniesSansAlliance.length > 0 && !searchQuery && (
              <select value={invCompId} onChange={e => setInvCompId(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm">
                <option value="">Ou choisir dans la liste...</option>
                {compagniesSansAlliance.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            )}
            <input type="text" value={invMsg} onChange={e => setInvMsg(e.target.value)} placeholder="Message (optionnel)" className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
            <button disabled={busy || !invCompId} onClick={async () => {
              try {
                await api(`/api/alliances/${detail.id}/invitations`, 'POST', { compagnie_id: invCompId, message: invMsg || undefined });
                flash('Invitation envoyée'); setInvCompId(''); setInvMsg(''); setSearchQuery(''); onRefresh();
              } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              <Send className="h-4 w-4" /> Inviter
            </button>
          </div>

          {detail.invitations_en_attente.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-400 mb-2">Invitations en cours</h4>
              {detail.invitations_en_attente.map(inv => (
                <div key={inv.id} className="text-sm text-slate-300 py-1">{inv.compagnie?.nom || inv.compagnie_id} — <span className="text-amber-400">en attente</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlotteTab({ detail, pdgCompagnieIds, onRefresh, flash, api, busy }: {
  detail: AllianceDetail; pdgCompagnieIds: string[];
  onRefresh: () => void;
  flash: (m: string, e?: boolean) => void;
  api: (u: string, m: string, b?: unknown) => Promise<unknown>; busy: boolean;
}) {
  const pending = detail.transferts.filter(t => t.statut === 'en_attente');
  const completed = detail.transferts.filter(t => t.statut !== 'en_attente' && t.statut !== 'annule');
  const myCompagniesInAlliance = detail.membres.filter(m => pdgCompagnieIds.includes(m.compagnie_id));

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-sky-400" />Transferts en attente</h3>
          {pending.map(t => {
            const source = detail.membres.find(m => m.compagnie_id === t.compagnie_source_id);
            const dest = t.compagnie_dest_id ? detail.membres.find(m => m.compagnie_id === t.compagnie_dest_id) : null;
            const isDestSpecifique = !!t.compagnie_dest_id;
            const isMeDest = isDestSpecifique && t.compagnie_dest_id === detail.my_compagnie_id;
            const canClaim = !isDestSpecifique && myCompagniesInAlliance.length > 0;
            return (
              <div key={t.id} className="p-3 rounded-lg bg-slate-700/20 mb-2 flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-slate-300">
                  <span className="font-medium text-slate-200">{t.type_transfert.toUpperCase()}</span>
                  {' '}{source?.compagnie?.nom || '?'} → {dest?.compagnie?.nom || (isDestSpecifique ? '?' : 'Tout le monde')}
                  {t.avion_label && <span className="block text-xs text-slate-400 mt-0.5">✈️ {t.avion_label}</span>}
                  {t.prix ? ` — ${t.prix.toLocaleString('fr-FR')} F$` : ''}
                  {t.duree_jours ? ` — ${t.duree_jours}j` : ''}
                </div>
                {(isMeDest || canClaim) && (
                  <div className="flex gap-2 items-center flex-wrap">
                    {canClaim && myCompagniesInAlliance.length > 1 && (
                      <select className="input py-1 px-2 text-xs w-36" id={`claim-${t.id}`}>
                        {myCompagniesInAlliance.map(m => (
                          <option key={m.compagnie_id} value={m.compagnie_id}>{m.compagnie?.nom || m.compagnie_id}</option>
                        ))}
                      </select>
                    )}
                    <button disabled={busy} onClick={async () => {
                      const compId = canClaim
                        ? (myCompagniesInAlliance.length === 1 ? myCompagniesInAlliance[0].compagnie_id : (document.getElementById(`claim-${t.id}`) as HTMLSelectElement)?.value)
                        : undefined;
                      if (canClaim && !compId) return;
                      try {
                        await api(`/api/alliances/${detail.id}/transferts`, 'PATCH', {
                          transfert_id: t.id,
                          action: 'accepter',
                          ...(canClaim && compId && { compagnie_dest_id: compId }),
                        });
                        flash(t.type_transfert === 'vente' ? 'Achat effectué' : 'Transfert accepté');
                        onRefresh();
                      } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                    }} className="px-2 py-1 text-xs rounded bg-emerald-600 text-white disabled:opacity-50">
                      <Check className="h-3 w-3 inline" /> {t.type_transfert === 'vente' ? 'Acheter' : 'Récupérer'}
                    </button>
                    {isMeDest && (
                      <button disabled={busy} onClick={async () => {
                        try { await api(`/api/alliances/${detail.id}/transferts`, 'PATCH', { transfert_id: t.id, action: 'refuser' }); flash('Transfert refusé'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                      }} className="px-2 py-1 text-xs rounded bg-red-600/50 text-red-200 disabled:opacity-50"><X className="h-3 w-3 inline" /> Refuser</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2">Historique des transferts</h3>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {completed.map(t => (
              <div key={t.id} className="text-sm text-slate-400 py-1">
                {t.type_transfert}
                {t.avion_label ? ` — ${t.avion_label}` : ''}
                {' '}— {t.statut} — {new Date(t.created_at).toLocaleDateString('fr-FR')}
                {t.prix ? ` — ${t.prix.toLocaleString('fr-FR')} F$` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.transferts.length === 0 && <p className="text-slate-500 text-sm">Aucun transfert d&apos;avion pour le moment.</p>}
      <p className="text-slate-500 text-xs">Pour proposer un transfert d&apos;avion, rendez-vous dans votre compagnie et utilisez le menu de l&apos;avion.</p>
    </div>
  );
}

function FinancesTab({ detail, isLeader, isPdg, pdgCompagnieIds, onRefresh, flash, api, busy }: {
  detail: AllianceDetail; isLeader: boolean; isPdg: boolean;
  pdgCompagnieIds: string[];
  onRefresh: () => void; flash: (m: string, e?: boolean) => void;
  api: (u: string, m: string, b?: unknown) => Promise<unknown>; busy: boolean;
}) {
  const [contribMontant, setContribMontant] = useState('');
  const [contribLibelle, setContribLibelle] = useState('');
  const [contribSource, setContribSource] = useState<'compagnie' | 'personnel'>('compagnie');
  const [fondsMontant, setFondsMontant] = useState('');
  const [fondsMotif, setFondsMotif] = useState('');
  const [showContrib, setShowContrib] = useState(false);
  const [showDemande, setShowDemande] = useState(false);

  const myCompagniesInAlliance = detail.membres.filter(m => pdgCompagnieIds.includes(m.compagnie_id));
  const [selectedCodeshareCompagnieId, setSelectedCodeshareCompagnieId] = useState(
    detail.my_compagnie_ids?.[0] ?? myCompagniesInAlliance[0]?.compagnie_id ?? ''
  );
  const selectedMember = detail.membres.find(m => m.compagnie_id === selectedCodeshareCompagnieId);
  const [myCodeshare, setMyCodeshare] = useState(selectedMember?.codeshare_pourcent ?? 0);

  useEffect(() => {
    const m = detail.membres.find(x => x.compagnie_id === selectedCodeshareCompagnieId);
    setMyCodeshare(m?.codeshare_pourcent ?? 0);
  }, [selectedCodeshareCompagnieId, detail.membres]);

  useEffect(() => {
    const mine = detail.membres.filter(m => pdgCompagnieIds.includes(m.compagnie_id));
    if (mine.length > 0 && !mine.some(m => m.compagnie_id === selectedCodeshareCompagnieId)) {
      setSelectedCodeshareCompagnieId(mine[0].compagnie_id);
    }
  }, [detail.id, detail.membres, pdgCompagnieIds, selectedCodeshareCompagnieId]);

  const pendingDemandes = detail.demandes_fonds.filter(d => d.statut === 'en_attente');
  const codeshareActif = detail.parametres?.codeshare_actif ?? false;

  return (
    <div className="space-y-6">
      {detail.compte_alliance && (
        <div className="p-4 rounded-lg bg-violet-900/20 border border-violet-700/30 flex items-center gap-3">
          <Landmark className="h-6 w-6 text-violet-400" />
          <div>
            <p className="text-slate-200 font-semibold">{detail.compte_alliance.solde.toLocaleString('fr-FR')} F$</p>
            <p className="text-slate-400 text-xs">VBAN : {detail.compte_alliance.vban}</p>
          </div>
        </div>
      )}

      {!codeshareActif && (
        <p className="text-sm text-slate-500">Le codeshare n&apos;est pas activé pour cette alliance. Le président peut l&apos;activer dans les paramètres.</p>
      )}
      {codeshareActif && (
        <div className="p-4 rounded-lg bg-sky-900/20 border border-sky-700/30 space-y-4">
          <div>
            <h4 className="text-sm font-medium text-sky-300 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />Codeshare — Partage des revenus</h4>
            <p className="text-xs text-slate-400 mt-1">Chaque PDG définit le % de ses revenus de vol reversé aux autres membres de l&apos;alliance.</p>
          </div>

          {!isPdg && (
            <p className="text-sm text-slate-500">Seuls les PDG de compagnies membres peuvent définir leur % codeshare. Si vous êtes PDG d&apos;une autre compagnie dans une autre alliance, sélectionnez-la dans la liste des alliances.</p>
          )}
          {isPdg && (
            <div>
              <p className="text-xs font-medium text-slate-300 mb-2 uppercase tracking-wide">Mon % de codeshare</p>
              {myCompagniesInAlliance.length > 1 && (
                <div className="mb-2">
                  <label className="block text-xs text-slate-500 mb-1">Compagnie à modifier</label>
                  <select
                    value={selectedCodeshareCompagnieId}
                    onChange={e => setSelectedCodeshareCompagnieId(e.target.value)}
                    className="w-full rounded border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm"
                  >
                    {myCompagniesInAlliance.map(m => (
                      <option key={m.compagnie_id} value={m.compagnie_id}>
                        {m.compagnie?.nom || m.compagnie_id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-800/20 border border-sky-700/40">
                <Building2 className="h-4 w-4 text-sky-400 flex-shrink-0" />
                <span className="text-sm text-slate-200 flex-1">{selectedMember?.compagnie?.nom || 'Ma compagnie'}</span>
                <input type="number" min={0} max={100} value={myCodeshare} onChange={e => setMyCodeshare(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-20 rounded border border-slate-600 bg-slate-800 text-slate-200 px-2 py-1.5 text-sm text-right" />
                <span className="text-sm text-slate-400">%</span>
                <button disabled={busy || myCodeshare === (selectedMember?.codeshare_pourcent ?? 0)} onClick={async () => {
                  try { await api(`/api/alliances/${detail.id}/membres`, 'PATCH', { action: 'set_codeshare', codeshare_pourcent: myCodeshare, compagnie_id: selectedCodeshareCompagnieId || undefined }); flash('Codeshare mis à jour'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                }} className="px-3 py-1.5 text-xs rounded bg-sky-600 text-white font-medium disabled:opacity-50 hover:bg-sky-500 transition">Enregistrer</button>
              </div>
            </div>
          )}

          {detail.membres.length > 1 && (
            <div>
              <p className="text-xs font-medium text-slate-300 mb-2 uppercase tracking-wide">% de partage de chaque compagnie</p>
              <div className="space-y-1">
                {detail.membres.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-slate-700/20">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-500" />
                      <span className="text-sm text-slate-200">{m.compagnie?.nom || m.compagnie_id}</span>
                      {pdgCompagnieIds.includes(m.compagnie_id) && <span className="text-[10px] bg-sky-600/30 text-sky-300 px-1.5 py-0.5 rounded">vous</span>}
                    </div>
                    <span className={`text-sm font-medium ${m.codeshare_pourcent > 0 ? 'text-sky-300' : 'text-slate-500'}`}>
                      {m.codeshare_pourcent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isPdg && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowContrib(!showContrib)} className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 text-sm flex items-center gap-1">
            <HandCoins className="h-4 w-4" /> Contribuer {showContrib ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button onClick={() => setShowDemande(!showDemande)} className="px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-300 text-sm flex items-center gap-1">
            <MessageSquare className="h-4 w-4" /> Demander des fonds {showDemande ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      )}

      {showContrib && (
        <div className="p-4 rounded-lg bg-slate-700/20 space-y-3">
          <h4 className="text-sm font-medium text-slate-300">Contribuer au compte alliance</h4>
          <div className="flex gap-1 p-1 bg-slate-700/50 rounded-lg w-fit">
            <button type="button" onClick={() => setContribSource('compagnie')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${contribSource === 'compagnie' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Building2 className="h-3 w-3 inline mr-1" />Compte compagnie
            </button>
            <button type="button" onClick={() => setContribSource('personnel')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${contribSource === 'personnel' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Wallet className="h-3 w-3 inline mr-1" />Compte personnel
            </button>
          </div>
          {contribSource === 'compagnie' && myCompagniesInAlliance.length > 1 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Compagnie contributrice</label>
              <select
                value={selectedCodeshareCompagnieId}
                onChange={e => setSelectedCodeshareCompagnieId(e.target.value)}
                className="w-full max-w-xs rounded border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm"
              >
                {myCompagniesInAlliance.map(m => (
                  <option key={m.compagnie_id} value={m.compagnie_id}>
                    {m.compagnie?.nom || m.compagnie_id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <input type="number" min="1" value={contribMontant} onChange={e => setContribMontant(e.target.value)} placeholder="Montant" className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-32 text-sm" />
            <input type="text" value={contribLibelle} onChange={e => setContribLibelle(e.target.value)} placeholder="Libellé (opt.)" className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 flex-1 text-sm" />
            <button disabled={busy || !contribMontant || Number(contribMontant) <= 0} onClick={async () => {
              const payload: Record<string, unknown> = { action: 'contribuer', montant: Number(contribMontant), libelle: contribLibelle || undefined, source: contribSource };
              if (contribSource === 'compagnie' && selectedCodeshareCompagnieId) payload.compagnie_id = selectedCodeshareCompagnieId;
              try { await api(`/api/alliances/${detail.id}/fonds`, 'POST', payload); flash(`${Number(contribMontant).toLocaleString('fr-FR')} F$ contribués depuis le compte ${contribSource === 'personnel' ? 'personnel' : 'compagnie'}`); setContribMontant(''); setContribLibelle(''); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">Contribuer</button>
          </div>
        </div>
      )}

      {showDemande && (
        <div className="p-4 rounded-lg bg-slate-700/20 space-y-2">
          <h4 className="text-sm font-medium text-slate-300">Demander des fonds</h4>
          {myCompagniesInAlliance.length > 1 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Compagnie demanderesse</label>
              <select
                value={selectedCodeshareCompagnieId}
                onChange={e => setSelectedCodeshareCompagnieId(e.target.value)}
                className="w-full max-w-xs rounded border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm"
              >
                {myCompagniesInAlliance.map(m => (
                  <option key={m.compagnie_id} value={m.compagnie_id}>
                    {m.compagnie?.nom || m.compagnie_id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <input type="number" min="1" value={fondsMontant} onChange={e => setFondsMontant(e.target.value)} placeholder="Montant" className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-32 text-sm" />
            <input type="text" value={fondsMotif} onChange={e => setFondsMotif(e.target.value)} placeholder="Motif *" className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 flex-1 text-sm" />
            <button disabled={busy || !fondsMontant || Number(fondsMontant) <= 0 || !fondsMotif.trim()} onClick={async () => {
              const payload: Record<string, unknown> = { action: 'demande_fonds', montant: Number(fondsMontant), motif: fondsMotif };
              if (myCompagniesInAlliance.length > 1 && selectedCodeshareCompagnieId) payload.compagnie_id = selectedCodeshareCompagnieId;
              try { await api(`/api/alliances/${detail.id}/fonds`, 'POST', payload); flash('Demande soumise'); setFondsMontant(''); setFondsMotif(''); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:opacity-50">Envoyer</button>
          </div>
        </div>
      )}

      {isLeader && pendingDemandes.length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2">Demandes en attente</h3>
          {pendingDemandes.map(d => {
            const comp = detail.membres.find(m => m.compagnie_id === d.compagnie_id);
            return (
              <div key={d.id} className="p-3 rounded-lg bg-amber-900/10 border border-amber-700/20 mb-2 flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="text-slate-200 font-medium">{comp?.compagnie?.nom || d.compagnie_id}</span>
                  <span className="text-slate-400"> — {d.montant.toLocaleString('fr-FR')} F$ — {d.motif}</span>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={async () => {
                    try { await api(`/api/alliances/${detail.id}/fonds`, 'PATCH', { demande_id: d.id, decision: 'accepter' }); flash('Fonds approuvés'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                  }} className="px-2 py-1 text-xs rounded bg-emerald-600 text-white disabled:opacity-50"><Check className="h-3 w-3 inline" /></button>
                  <button disabled={busy} onClick={async () => {
                    try { await api(`/api/alliances/${detail.id}/fonds`, 'PATCH', { demande_id: d.id, decision: 'refuser' }); flash('Demande refusée'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
                  }} className="px-2 py-1 text-xs rounded bg-red-600/50 text-red-200 disabled:opacity-50"><X className="h-3 w-3 inline" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail.contributions.length > 0 && (
        <div>
          <h3 className="font-medium text-slate-200 mb-2">Historique contributions</h3>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {detail.contributions.map(c => {
              const nom = c.compagnie_nom ?? detail.membres.find(m => m.compagnie_id === c.compagnie_id)?.compagnie?.nom ?? '?';
              return <div key={c.id} className="text-sm text-slate-400">{nom} — +{c.montant.toLocaleString('fr-FR')} F$ — {c.libelle} — {new Date(c.created_at).toLocaleDateString('fr-FR')}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AnnoncesTab({ detail, isLeader, onRefresh, flash, api, busy }: {
  detail: AllianceDetail; isLeader: boolean;
  onRefresh: () => void; flash: (m: string, e?: boolean) => void;
  api: (u: string, m: string, b?: unknown) => Promise<unknown>; busy: boolean;
}) {
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [important, setImportant] = useState(false);
  const canPost = isLeader || detail.my_role === 'secretaire';

  return (
    <div className="space-y-6">
      {canPost && (
        <div className="p-4 rounded-lg bg-slate-700/20 space-y-2">
          <h4 className="text-sm font-medium text-slate-300">Publier une annonce</h4>
          <input type="text" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre" className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
          <textarea value={contenu} onChange={e => setContenu(e.target.value)} placeholder="Contenu" rows={3} className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} className="rounded border-slate-600" />
              Important
            </label>
            <button disabled={busy || !titre.trim() || !contenu.trim()} onClick={async () => {
              try { await api(`/api/alliances/${detail.id}/annonces`, 'POST', { titre, contenu, important }); flash('Annonce publiée'); setTitre(''); setContenu(''); setImportant(false); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
            }} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Publier
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {detail.annonces.length === 0 && <p className="text-slate-500 text-sm">Aucune annonce.</p>}
        {detail.annonces.map(a => (
          <div key={a.id} className={`p-4 rounded-lg border ${a.important ? 'bg-amber-900/10 border-amber-700/30' : 'bg-slate-700/10 border-slate-700/30'}`}>
            <div className="flex items-center gap-2 mb-1">
              {a.important && <ShieldCheck className="h-4 w-4 text-amber-400" />}
              <span className="font-medium text-slate-200">{a.titre}</span>
              <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{a.contenu}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParametresTab({ detail, onRefresh, flash, api, busy }: {
  detail: AllianceDetail; onRefresh: () => void;
  flash: (m: string, e?: boolean) => void;
  api: (u: string, m: string, b?: unknown) => Promise<unknown>; busy: boolean;
}) {
  const p = detail.parametres;
  const [form, setForm] = useState({
    codeshare_actif: p?.codeshare_actif ?? false,
    codeshare_pourcent: p?.codeshare_pourcent ?? 0,
    taxe_alliance_actif: p?.taxe_alliance_actif ?? false,
    taxe_alliance_pourcent: p?.taxe_alliance_pourcent ?? 0,
    transfert_avions_actif: p?.transfert_avions_actif ?? false,
    pret_avions_actif: p?.pret_avions_actif ?? false,
    don_avions_actif: p?.don_avions_actif ?? false,
    partage_hubs_actif: p?.partage_hubs_actif ?? false,
  });

  const [editNom, setEditNom] = useState(detail.nom);
  const [editDesc, setEditDesc] = useState(detail.description || '');
  const [editDevise, setEditDevise] = useState(detail.devise || '');

  function toggle(key: keyof typeof form) {
    setForm(f => ({ ...f, [key]: !f[key] }));
  }
  function setNum(key: 'codeshare_pourcent' | 'taxe_alliance_pourcent', v: number) {
    setForm(f => ({ ...f, [key]: Math.min(100, Math.max(0, v)) }));
  }

  const items: { key: keyof typeof form; label: string; desc: string; sub?: 'codeshare_pourcent' | 'taxe_alliance_pourcent'; subLabel?: string }[] = [
    { key: 'codeshare_actif', label: 'Codeshare', desc: 'Chaque PDG définit un % de ses revenus de vol qui sera redistribué aux autres membres de l\'alliance. Le % se configure dans l\'onglet Finances.' },
    { key: 'taxe_alliance_actif', label: 'Taxe alliance', desc: 'Prélève automatiquement un % des revenus de chaque vol pour alimenter le compte de l\'alliance.', sub: 'taxe_alliance_pourcent', subLabel: '% taxe' },
    { key: 'transfert_avions_actif', label: 'Vente d\'avions entre membres', desc: 'Permet aux compagnies membres de se vendre des avions entre elles contre des F$.' },
    { key: 'pret_avions_actif', label: 'Prêt d\'avions entre membres', desc: 'Les locations d\'avions entre membres de l\'alliance deviennent gratuites (pas de loyer journalier).' },
    { key: 'don_avions_actif', label: 'Don d\'avions entre membres', desc: 'Permet aux compagnies membres de donner gratuitement des avions à d\'autres membres.' },
    { key: 'partage_hubs_actif', label: 'Partage de hubs', desc: 'Les compagnies peuvent réparer leurs avions dans les hubs des autres membres de l\'alliance.' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-medium text-slate-200">Informations générales</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nom</label>
            <input type="text" value={editNom} onChange={e => setEditNom(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Devise</label>
            <input type="text" value={editDevise} onChange={e => setEditDevise(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Description</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm" />
          </div>
        </div>
        <button disabled={busy} onClick={async () => {
          try { await api(`/api/alliances/${detail.id}`, 'PATCH', { nom: editNom, description: editDesc, devise: editDevise }); flash('Informations mises à jour'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
        }} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50">Enregistrer</button>
      </div>

      <div className="pt-4 border-t border-slate-700 space-y-3">
        <h3 className="font-medium text-slate-200">Options de l&apos;alliance</h3>
        {items.map(item => (
          <div key={item.key} className="rounded-lg bg-slate-700/20 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">{item.label}</span>
              <button onClick={() => toggle(item.key)} className={`w-10 h-5 rounded-full transition flex-shrink-0 ${form[item.key] ? 'bg-violet-500' : 'bg-slate-600'} relative`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${form[item.key] ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
            {item.sub && form[item.key] && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50">
                <span className="text-xs text-slate-400">{item.subLabel}</span>
                <input type="number" min={0} max={100} value={form[item.sub]} onChange={e => setNum(item.sub!, Number(e.target.value) || 0)} className="w-20 rounded border border-slate-600 bg-slate-800 text-slate-200 px-2 py-1 text-sm text-right" />
              </div>
            )}
          </div>
        ))}
        <button disabled={busy} onClick={async () => {
          try { await api(`/api/alliances/${detail.id}/parametres`, 'PATCH', form); flash('Paramètres enregistrés'); onRefresh(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
        }} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50">Enregistrer les paramètres</button>
      </div>

      {detail.my_role === 'president' && (
        <div className="pt-4 border-t border-red-700/30 space-y-2">
          <h3 className="font-medium text-red-400">Zone dangereuse</h3>
          <button disabled={busy} onClick={async () => {
            if (!confirm('Dissoudre l\'alliance ? Cette action est irréversible.')) return;
            try { await api(`/api/alliances/${detail.id}`, 'DELETE'); flash('Alliance dissoute'); window.location.reload(); } catch (err) { flash(err instanceof Error ? err.message : 'Erreur', true); }
          }} className="px-4 py-2 rounded-lg bg-red-600/30 text-red-300 text-sm font-medium hover:bg-red-600/50 disabled:opacity-50">
            Dissoudre l&apos;alliance
          </button>
        </div>
      )}
    </div>
  );
}
