'use client';

import { useState, useTransition, useEffect, useMemo, useCallback } from 'react';
import {
  Send, RefreshCw, History, ArrowUpRight, ArrowDownLeft,
  Copy, Check, TrendingUp, TrendingDown, ChevronRight,
  Activity, CreditCard, BadgeCheck, Plane, Wrench, Receipt,
  ArrowLeftRight, DollarSign, FileText, Ban, Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toLocaleDateStringUTC } from '@/lib/date-utils';
import FelitzTransactionDetailModal from '@/components/FelitzTransactionDetailModal';

interface Transaction {
  id: string;
  type: string;
  montant: number;
  libelle: string;
  description?: string | null;
  created_at: string;
}

interface Virement {
  id: string;
  compte_source_id: string;
  compte_dest_vban: string;
  montant: number;
  libelle?: string | null;
  created_at: string;
}

interface Props {
  compteId: string;
  solde: number;
  vban: string;
  transactions: Transaction[];
  isAdmin?: boolean;
  isEntreprise?: boolean;
  isMilitaire?: boolean;
  compagnieNom?: string;
}

const MONTANT_LIBELLE_REQUIRED = 1_000_000;

type Tab = 'overview' | 'transactions' | 'virements' | 'cheques';

function detectTransactionMeta(tx: Transaction): { label: string; colorClass: string } {
  const lib = (tx.libelle || '').toLowerCase();
  if (lib.includes('salaire')) {
    if (lib.includes('atc')) return { label: 'Salaire ATC', colorClass: 'text-amber-400' };
    return { label: 'Salaire vol', colorClass: 'text-sky-400' };
  }
  if (lib.includes('taxe') || lib.includes('tax')) return { label: 'Taxe', colorClass: 'text-orange-400' };
  if (lib.includes('réparation') || lib.includes('reparation') || lib.includes('maintenance'))
    return { label: 'Réparation', colorClass: 'text-yellow-400' };
  if (lib.includes('virement') || lib.includes('transfer')) return { label: 'Virement', colorClass: 'text-purple-400' };
  if (lib.includes('chèque') || lib.includes('cheque') || lib.includes('compensation'))
    return { label: 'Chèque', colorClass: 'text-teal-400' };
  if (lib.includes('amende') || lib.includes('sanction')) return { label: 'Amende', colorClass: 'text-red-400' };
  if (tx.type === 'credit') return { label: 'Crédit', colorClass: 'text-emerald-400' };
  return { label: 'Débit', colorClass: 'text-red-400' };
}

function formatAmt(n: number): string {
  return Math.abs(n).toLocaleString('fr-FR');
}

function formatDate(dateStr: string) {
  return toLocaleDateStringUTC(dateStr, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' UTC';
}

function TxIcon({ tx }: { tx: Transaction }) {
  const lib = (tx.libelle || '').toLowerCase();
  const isCredit = tx.type === 'credit';
  const c = isCredit ? 'text-emerald-400' : 'text-red-400';
  if (lib.includes('salaire')) return <Plane className={`h-3.5 w-3.5 ${c}`} />;
  if (lib.includes('taxe') || lib.includes('tax')) return <Receipt className={`h-3.5 w-3.5 text-orange-400`} />;
  if (lib.includes('réparation') || lib.includes('reparation') || lib.includes('maintenance'))
    return <Wrench className={`h-3.5 w-3.5 text-yellow-400`} />;
  if (lib.includes('virement') || lib.includes('transfer')) return <ArrowLeftRight className={`h-3.5 w-3.5 text-purple-400`} />;
  if (lib.includes('chèque') || lib.includes('cheque') || lib.includes('compensation'))
    return <CreditCard className={`h-3.5 w-3.5 text-teal-400`} />;
  if (lib.includes('amende') || lib.includes('sanction')) return <Ban className={`h-3.5 w-3.5 text-red-400`} />;
  if (isCredit) return <ArrowDownLeft className={`h-3.5 w-3.5 ${c}`} />;
  return <ArrowUpRight className={`h-3.5 w-3.5 ${c}`} />;
}

function MiniBarChart({ transactions }: { transactions: Transaction[] }) {
  const now = new Date();
  const days: { net: number; label: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const dayTx = transactions.filter(t => t.created_at.slice(0, 10) === dayStr);
    let net = 0;
    dayTx.forEach(t => { net += t.type === 'credit' ? t.montant : -t.montant; });
    days.push({ net, label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) });
  }
  const maxAbs = Math.max(...days.map(d => Math.abs(d.net)), 1);
  return (
    <div className="flex items-end gap-0.5 h-12" title="Activité nette quotidienne sur 30 jours">
      {days.map((d, i) => {
        const pct = Math.abs(d.net) / maxAbs;
        const h = Math.max(Math.round(pct * 48), 2);
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${h}px`,
              backgroundColor: d.net >= 0 ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)',
            }}
            title={`${d.label} : ${d.net >= 0 ? '+' : ''}${d.net.toLocaleString('fr-FR')} F$`}
          />
        );
      })}
    </div>
  );
}

export default function FelitzBankClient({ compteId, vban, transactions: initialTransactions, isEntreprise, isMilitaire }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [transactions, setTransactions] = useState(initialTransactions);
  const [fullHistoryLoaded, setFullHistoryLoaded] = useState(false);
  const [loadingFullHistory, setLoadingFullHistory] = useState(false);
  const [vbanDest, setVbanDest] = useState('');
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [virements, setVirements] = useState<Virement[]>([]);
  const [copied, setCopied] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [txPeriod, setTxPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [txSearch, setTxSearch] = useState('');

  const accentColor: 'emerald' | 'sky' | 'red' = isMilitaire ? 'red' : isEntreprise ? 'sky' : 'emerald';

  const montantNum = parseInt(montant) || 0;
  const libelleRequired = montantNum >= MONTANT_LIBELLE_REQUIRED;
  const libelleError = libelleRequired && !libelle.trim();

  // Stats mois courant
  const now = useMemo(() => new Date(), []);
  const thisMonthTx = useMemo(() => transactions.filter(t => {
    const d = new Date(t.created_at);
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }), [transactions, now]);
  const totalCredit = useMemo(() => thisMonthTx.filter(t => t.type === 'credit').reduce((s, t) => s + t.montant, 0), [thisMonthTx]);
  const totalDebit = useMemo(() => thisMonthTx.filter(t => t.type === 'debit').reduce((s, t) => s + t.montant, 0), [thisMonthTx]);

  // Filtrage transactions
  const filteredTx = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    const nowMs = Date.now();
    return transactions.filter(t => {
      if (txFilter !== 'all' && t.type !== txFilter) return false;
      if (txPeriod !== 'all') {
        const days = txPeriod === '7d' ? 7 : txPeriod === '30d' ? 30 : 90;
        if ((nowMs - new Date(t.created_at).getTime()) / 86_400_000 > days) return false;
      }
      if (q && !(t.libelle?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [transactions, txFilter, txPeriod, txSearch]);

  // Chèques / salaires
  const cheques = useMemo(() => transactions.filter(t => {
    const lib = (t.libelle || '').toLowerCase();
    return lib.includes('chèque') || lib.includes('cheque') || lib.includes('salaire') || lib.includes('compensation');
  }), [transactions]);

  useEffect(() => {
    if (!fullHistoryLoaded) {
      setTransactions(initialTransactions);
    }
  }, [initialTransactions, fullHistoryLoaded]);

  const loadFullHistory = useCallback(async () => {
    if (fullHistoryLoaded || loadingFullHistory) return;
    setLoadingFullHistory(true);
    try {
      const res = await fetch(`/api/felitz/transactions?compte_id=${compteId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTransactions(data);
          setFullHistoryLoaded(true);
        }
      }
    } catch {
      // silencieux — on garde l'aperçu SSR
    } finally {
      setLoadingFullHistory(false);
    }
  }, [compteId, fullHistoryLoaded, loadingFullHistory]);

  const loadVirements = useCallback(async () => {
    try {
      const res = await fetch(`/api/felitz/virement?compte_id=${compteId}`);
      if (res.ok) {
        const data = await res.json();
        setVirements(Array.isArray(data) ? data : []);
      }
    } catch {
      setVirements([]);
    }
  }, [compteId]);

  function openFullHistory() {
    setTxFilter('all');
    setTxPeriod('all');
    setActiveTab('transactions');
    void loadFullHistory();
  }

  useEffect(() => {
    if (activeTab === 'transactions') {
      void loadFullHistory();
    }
  }, [activeTab, loadFullHistory]);

  useEffect(() => {
    void loadVirements();
  }, [loadVirements]);

  async function handleVirement(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (libelleError) {
      setError('Le libellé est obligatoire pour les virements supérieurs ou égaux à 1 000 000 F$');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/felitz/virement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_source_id: compteId,
          vban_destination: vbanDest.trim(),
          montant: montantNum,
          libelle: libelle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Virement effectué avec succès');
      setVbanDest('');
      setMontant('');
      setLibelle('');
      void loadVirements();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function copyVban() {
    navigator.clipboard.writeText(vban).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const accentGradient = accentColor === 'red'
    ? 'from-red-600 to-red-700 shadow-red-900/40'
    : accentColor === 'sky'
      ? 'from-sky-600 to-sky-700 shadow-sky-900/40'
      : 'from-emerald-600 to-emerald-700 shadow-emerald-900/40';
  const accentBg = accentColor === 'red'
    ? 'bg-red-600/80 hover:bg-red-600'
    : accentColor === 'sky'
      ? 'bg-sky-600/80 hover:bg-sky-600'
      : 'bg-emerald-600/80 hover:bg-emerald-600';

  const tabBtn = (tab: Tab, label: string, badge?: number) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        activeTab === tab
          ? `bg-gradient-to-br ${accentGradient} text-white shadow-md`
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 bg-slate-700/80 px-1.5 py-0.5 rounded-full text-[9px]">{badge}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-3 mt-3">
      {/* VBAN avec copier */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold shrink-0">VBAN</span>
        <span className="font-mono text-slate-300 text-xs break-all flex-1">{vban}</span>
        <button
          type="button"
          onClick={copyVban}
          className="shrink-0 p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-500 hover:text-slate-300 transition-colors"
          title="Copier le VBAN"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-800/40 border border-slate-700/40">
        {tabBtn('overview', "Vue d'ensemble")}
        {tabBtn('transactions', 'Transactions', transactions.length)}
        {tabBtn('virements', 'Virements')}
        {!isMilitaire && cheques.length > 0 && tabBtn('cheques', 'Chèques', cheques.length)}
      </div>

      {/* ===== Vue d'ensemble ===== */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* Stats mois */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3 w-3 text-emerald-400" />
                <p className="text-[9px] text-emerald-400/80 uppercase tracking-wider font-semibold">Entrant ce mois</p>
              </div>
              <p className="text-base font-bold text-emerald-300 tabular-nums">+{formatAmt(totalCredit)} F$</p>
              <p className="text-[9px] text-slate-600 mt-0.5">{thisMonthTx.filter(t => t.type === 'credit').length} tx</p>
            </div>
            <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3 w-3 text-red-400" />
                <p className="text-[9px] text-red-400/80 uppercase tracking-wider font-semibold">Sortant ce mois</p>
              </div>
              <p className="text-base font-bold text-red-300 tabular-nums">−{formatAmt(totalDebit)} F$</p>
              <p className="text-[9px] text-slate-600 mt-0.5">{thisMonthTx.filter(t => t.type === 'debit').length} tx</p>
            </div>
          </div>

          {/* Graphique 30j (CSS barres) */}
          <div className="rounded-xl border border-slate-800/50 bg-slate-800/20 p-4">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-3 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Activité sur 30 jours
            </p>
            <MiniBarChart transactions={transactions} />
            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-slate-600">J−30</span>
              <div className="flex items-center gap-3 text-[9px] text-slate-600">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/50"></span> Crédit</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500/50"></span> Débit</span>
              </div>
              <span className="text-[9px] text-slate-600">Auj.</span>
            </div>
          </div>

          {/* Transactions récentes */}
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Transactions récentes</p>
            <div className="space-y-0.5">
              {transactions.length === 0 && (
                <p className="text-xs text-slate-600 py-4 text-center">Aucune transaction</p>
              )}
              {transactions.slice(0, 5).map(tx => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-md shrink-0 ${tx.type === 'credit' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <TxIcon tx={tx} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate max-w-[140px]">{tx.libelle || '—'}</p>
                      <p className="text-[9px] text-slate-600">{formatDate(tx.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium tabular-nums whitespace-nowrap ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.type === 'credit' ? '+' : '−'}{formatAmt(tx.montant)} F$
                  </span>
                </button>
              ))}
              {transactions.length > 5 && (
                <button
                  type="button"
                  onClick={openFullHistory}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-400 py-2 flex items-center justify-center gap-1"
                >
                  Voir tout l&apos;historique <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Transactions ===== */}
      {activeTab === 'transactions' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {(['all', 'credit', 'debit'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTxFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    txFilter === f ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/40 text-slate-500 hover:bg-slate-800/70'
                  }`}
                >
                  {f === 'all' ? 'Tout' : f === 'credit' ? 'Crédits' : 'Débits'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['7d', '30d', '90d', 'all'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTxPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    txPeriod === p ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/40 text-slate-500 hover:bg-slate-800/70'
                  }`}
                >
                  {p === 'all' ? 'Tout' : p}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={txSearch}
            onChange={e => setTxSearch(e.target.value)}
            placeholder="Rechercher dans les transactions…"
            className="input w-full text-sm"
          />
          <div className="text-[9px] text-slate-500 px-1">
            {filteredTx.length} / {transactions.length} transaction{transactions.length > 1 ? 's' : ''}
            {loadingFullHistory && (
              <span className="ml-2 inline-flex items-center gap-1 text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Chargement…
              </span>
            )}
            {!loadingFullHistory && !fullHistoryLoaded && transactions.length >= 100 && (
              <span className="ml-2 text-amber-400/80">(aperçu — historique en cours de chargement)</span>
            )}
            {' · '}
            <span className="text-emerald-400">
              +{formatAmt(filteredTx.filter(t => t.type === 'credit').reduce((s, t) => s + t.montant, 0))} F$
            </span>
            {' · '}
            <span className="text-red-400">
              −{formatAmt(filteredTx.filter(t => t.type === 'debit').reduce((s, t) => s + t.montant, 0))} F$
            </span>
          </div>
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
            {filteredTx.length === 0 ? (
              <p className="text-sm text-center text-slate-600 py-6">Aucune transaction</p>
            ) : filteredTx.map(tx => (
              <button
                key={tx.id}
                type="button"
                onClick={() => setSelectedTx(tx)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors text-left border border-transparent hover:border-slate-700/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-md shrink-0 ${tx.type === 'credit' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    <TxIcon tx={tx} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 truncate max-w-[180px]">{tx.libelle || '—'}</p>
                    <p className="text-[9px] text-slate-600">{formatDate(tx.created_at)}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium tabular-nums whitespace-nowrap ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {tx.type === 'credit' ? '+' : '−'}{formatAmt(tx.montant)} F$
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Virements ===== */}
      {activeTab === 'virements' && (
        <div className="space-y-4 animate-fade-in">
          <form onSubmit={handleVirement} className="rounded-xl border border-slate-800/50 bg-slate-800/20 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Send className="h-4 w-4" />
              Effectuer un virement
            </h3>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                VBAN destinataire
              </label>
              <input
                type="text"
                value={vbanDest}
                onChange={e => setVbanDest(e.target.value)}
                placeholder="MIXOU… ENTERMIXOU…"
                className="input w-full font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                Montant (F$)
              </label>
              <input
                type="number"
                value={montant}
                onChange={e => setMontant(e.target.value)}
                min="1"
                className="input w-full tabular-nums"
                required
              />
              {montantNum >= MONTANT_LIBELLE_REQUIRED && (
                <p className="text-[10px] text-amber-400/90 mt-1 flex items-center gap-1">
                  <Activity className="h-3 w-3 shrink-0" />
                  Libellé obligatoire pour les virements supérieurs ou égaux à 1 000 000 F$
                </p>
              )}
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-wider font-semibold mb-1.5 transition-colors ${
                libelleError ? 'text-amber-400' : libelleRequired ? 'text-amber-400/70' : 'text-slate-500'
              }`}>
                Libellé{libelleRequired ? <span className="ml-1 text-red-400">* requis</span> : ' (optionnel)'}
              </label>
              <input
                type="text"
                value={libelle}
                onChange={e => setLibelle(e.target.value)}
                placeholder="Ex : Paiement carburant…"
                className={`input w-full transition-all ${
                  libelleError
                    ? 'border-amber-500/60 bg-amber-500/5 focus:ring-amber-500/40 ring-1 ring-amber-500/40'
                    : ''
                }`}
                required={libelleRequired}
              />
              {libelleError && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Libellé obligatoire pour les virements supérieurs ou égaux à 1 000 000 F$
                </p>
              )}
            </div>
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>
            )}
            {success && (
              <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center gap-2">
                <BadgeCheck className="h-4 w-4" />{success}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={loading || libelleError}
                className={`flex-1 px-4 py-2.5 disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${accentBg}`}
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirmer le virement
              </button>
              <button
                type="button"
                onClick={() => { setVbanDest(''); setMontant(''); setLibelle(''); setError(''); setSuccess(''); }}
                className="px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-xl font-medium text-sm transition-colors"
              >
                Effacer
              </button>
            </div>
          </form>

          {virements.length > 0 && (
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <History className="h-3 w-3" />
                Historique des virements ({virements.length})
              </p>
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                {virements.map(v => (
                  <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/30 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300">
                        <span className="text-slate-500">→</span>{' '}
                        <span className="font-mono text-sky-400/80">{v.compte_dest_vban}</span>
                        {v.libelle && <span className="text-slate-500 ml-1">— {v.libelle}</span>}
                      </p>
                      <p className="text-[9px] text-slate-600">{formatDate(v.created_at)}</p>
                    </div>
                    <span className="font-medium text-red-400/80 text-xs tabular-nums whitespace-nowrap">
                      −{formatAmt(v.montant)} F$
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Chèques / Salaires ===== */}
      {activeTab === 'cheques' && (
        <div className="space-y-2 animate-fade-in">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
            Chèques &amp; Salaires ({cheques.length})
          </p>
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
            {cheques.length === 0 ? (
              <p className="text-sm text-center text-slate-600 py-6">Aucun chèque</p>
            ) : cheques.map(tx => {
              const meta = detectTransactionMeta(tx);
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-md shrink-0 ${tx.type === 'credit' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <TxIcon tx={tx} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[9px] font-semibold uppercase tracking-wide ${meta.colorClass}`}>{meta.label}</p>
                      <p className="text-xs text-slate-300 truncate max-w-[160px]">{tx.libelle || '—'}</p>
                      <p className="text-[9px] text-slate-600">{formatDate(tx.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium tabular-nums whitespace-nowrap ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.type === 'credit' ? '+' : '−'}{formatAmt(tx.montant)} F$
                  </span>
                </button>
              );
            })}
          </div>
          {/* Totaux chèques */}
          <div className="flex gap-3 text-xs px-1 pt-1 border-t border-slate-800/40">
            <span className="text-emerald-400 font-medium">
              Reçus : +{formatAmt(cheques.filter(t => t.type === 'credit').reduce((s, t) => s + t.montant, 0))} F$
            </span>
            <span className="text-red-400 font-medium">
              Émis : −{formatAmt(cheques.filter(t => t.type === 'debit').reduce((s, t) => s + t.montant, 0))} F$
            </span>
          </div>
        </div>
      )}

      {/* Icônes non-utilisées mais nécessaires pour les builds Tailwind */}
      <span className="hidden"><DollarSign /><FileText /></span>

      {/* Modal détail transaction */}
      {selectedTx && (
        <FelitzTransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
