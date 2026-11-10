'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, CalendarDays, Wallet, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  calculerOffrePret, echeancierPret, parseMontantPret, PRETS_STANDARDS,
  MIN_PRET_PERSONNALISE, MAX_PRET, MAX_DUREE_PRET,
  type ModeRemboursement, type OffrePret, type PretBancaire,
} from '@/lib/company-loans';

type Dashboard = {
  pretActif: PretBancaire | null;
  historique: PretBancaire[];
  capacite: { tresorerie: number; avions: number; dettes: number; capital: number; plafond: number };
  serverTime: string;
};
const money = (n: number) => Number(n).toLocaleString('fr-FR') + ' F$';
const date = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const inputClass = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-slate-100 focus:outline-none focus:border-sky-400';
const actionClass = 'rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40';

export default function CompagniePretClient({ compagnieId }: { compagnieId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('1000000');
  const [days, setDays] = useState('30');
  const [offerType, setOfferType] = useState<OffrePret>('personnalise');
  const [mode, setMode] = useState<ModeRemboursement>('quotidien');
  const [repayment, setRepayment] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<{ payload: string; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/compagnies/' + compagnieId + '/pret', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Service bancaire indisponible.');
      setData(body);
      setError(null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Impossible de charger les prêts.');
    } finally { setLoading(false); }
  }, [compagnieId]);
  useEffect(() => { void load(); }, [load]);

  const selected = calculerOffrePret(parseMontantPret(amount) ?? NaN, Number(days), offerType);
  const limit = data ? Math.min(MAX_PRET, Number(data.capacite.plafond)) : 0;
  const active = data?.pretActif ?? null;
  const schedule = active ? echeancierPret(active, data ? Date.parse(data.serverTime) : Date.now()) : null;
  const canBorrow = !!selected && !!data && !active && selected.montant <= limit && Number(data.capacite.tresorerie) >= 0;
  const parsedRepayment = parseMontantPret(repayment);
  const canRepay = !!parsedRepayment && !!schedule && !!data &&
    parsedRepayment <= schedule.reste && parsedRepayment <= Number(data.capacite.tresorerie);

  async function send(method: 'POST' | 'PATCH', payload: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const signature = JSON.stringify({ compagnieId, method, payload });
    if (pending.current?.payload !== signature) pending.current = { payload: signature, id: crypto.randomUUID() };
    try {
      const response = await fetch('/api/compagnies/' + compagnieId + '/pret', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, request_id: pending.current.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Opération non confirmée.');
      pending.current = null;
      toast.success(result.message);
      setRepayment('');
      await load();
      startTransition(() => router.refresh());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Opération non confirmée. Réessayez.';
      setError(message);
      toast.error(message);
    } finally { inFlight.current = false; setBusy(false); }
  }

  function borrow() {
    if (!canBorrow || !selected || busy) return;
    const details = [
      'Emprunter ' + money(selected.montant) + ' sur ' + selected.dureeJours + ' jours ?',
      'Intérêts fixes : ' + money(selected.interets) + ' (' + selected.tauxInteret.toLocaleString('fr-FR') + ' %).',
      'Total : ' + money(selected.total) + '.',
      mode === 'quotidien' ? 'Prélèvements quotidiens dès le lendemain.' : 'Prélèvement unique à la date limite.',
      'Tout solde restant sera prélevé à l’échéance, même en cas de découvert.',
    ];
    if (!window.confirm(details.join('\n\n'))) return;
    void send('POST', { montant: selected.montant, duree_jours: selected.dureeJours, offre: offerType, mode_remboursement: mode });
  }

  function repay(value: number) {
    if (!active || !schedule || !data || busy || value <= 0 || value > schedule.reste || value > Number(data.capacite.tresorerie)) return;
    if (!window.confirm('Rembourser ' + money(value) + ' depuis le compte de la compagnie ?')) return;
    void send('PATCH', { montant: value, pret_id: active.id });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-100"><Landmark className="h-5 w-5 text-sky-400" />Financement bancaire</h3>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="text-sm text-slate-400 hover:text-slate-100 disabled:opacity-40" aria-label="Actualiser les prêts"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {loading && <p className="text-sm text-slate-400" role="status">Chargement des prêts…</p>}
      {data && !loading && <>
        <div className="card border-slate-700">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Trésorerie disponible" value={money(data.capacite.tresorerie)} />
            <Metric label="Capital net retenu" value={money(data.capacite.capital)} />
            <Metric label="Plafond d’emprunt" value={money(limit)} accent />
          </div>
          <p className="mt-3 text-xs text-slate-400">Capital retenu : trésorerie + valeur catalogue des avions possédés non détruits − dettes bancaires restantes. Les avions dont une autre compagnie est propriétaire sont exclus.</p>
        </div>

        {active && schedule ? <div className="card space-y-5 border-amber-500/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-amber-200">Prêt en cours</h4>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300">{active.mode_remboursement === 'quotidien' ? 'Remboursement quotidien' : active.mode_remboursement === 'echeance' ? 'En une fois à l’échéance' : 'Ancien prêt · prélèvements sur les vols'}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Capital emprunté" value={money(active.montant_emprunte)} />
            <Metric label="Intérêts fixes" value={money(active.montant_total_du - active.montant_emprunte)} />
            <Metric label="Déjà remboursé" value={money(active.montant_rembourse)} />
            <Metric label="Reste à payer" value={money(schedule.reste)} accent />
          </div>
          <div>
            <label className="mb-2 block text-xs text-slate-400" htmlFor="loan-progress">Remboursement du total de {money(active.montant_total_du)}</label>
            <progress id="loan-progress" className="h-3 w-full accent-sky-500" max={active.montant_total_du} value={active.montant_rembourse} />
          </div>
          <div className="rounded-lg bg-slate-800/50 p-4 text-sm text-slate-300">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Date limite : {active.echeance_at ? date(active.echeance_at) : 'non définie'}</p>
            {schedule.prochaine && <p className="mt-2">{schedule.exigible > 0 ? 'Prélèvement à régulariser' : 'Prochain prélèvement prévu'} : {money(schedule.prochaine.montant)}, le {date(schedule.prochaine.date)}.</p>}
            {active.mode_remboursement === 'vols' && <p className="mt-2">Ce prêt conserve ses conditions initiales : 30 % du revenu compagnie de chaque vol sont affectés au remboursement.</p>}
            {schedule.exigible > 0 && <p className="mt-2 text-amber-300">Montant actuellement exigible : {money(schedule.exigible)}. Approvisionnez le compte pour permettre le prélèvement.</p>}
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
            <h5 className="mb-2 flex items-center gap-2 font-medium text-emerald-200"><Wallet className="h-4 w-4" />Remboursement anticipé</h5>
            <p className="mb-3 text-xs text-slate-400">Partiel ou total, sans frais supplémentaires. Les intérêts fixés à la souscription restent dus. Un versement anticipé couvre les prochaines échéances.</p>
            <label htmlFor="loan-repayment" className="sr-only">Montant à rembourser en F$</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="loan-repayment" type="text" inputMode="numeric" value={repayment} onChange={e => setRepayment(e.target.value)} className={inputClass} placeholder="Montant en F$" disabled={busy} />
              <button type="button" onClick={() => canRepay && repay(parsedRepayment!)} disabled={!canRepay || busy} className={actionClass}>Rembourser</button>
              <button type="button" onClick={() => repay(schedule.reste)} disabled={busy || schedule.reste <= 0 || schedule.reste > Number(data.capacite.tresorerie)} className={actionClass + ' whitespace-nowrap'}>Solder le prêt</button>
            </div>
          </div>
        </div> : <div className="card space-y-5 border-sky-500/20">
          <div>
            <h4 className="text-lg font-semibold text-slate-100">Composer mon prêt</h4>
            <p className="mt-1 text-sm text-slate-400">De 1 à 10 millions de F$, dans la limite de votre capital. Les petites offres standard restent disponibles.</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Montants standard">
            {PRETS_STANDARDS.map(n => <button key={n} type="button" disabled={busy || n > limit} onClick={() => { setAmount(String(n)); setOfferType('standard'); }} aria-pressed={offerType === 'standard' && Number(amount) === n}
              className={'rounded-lg border px-3 py-2 text-sm disabled:opacity-30 ' + (offerType === 'standard' && Number(amount) === n ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-300 hover:border-slate-500')}>{money(n)}</button>)}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="loan-amount" className="mb-2 block text-sm text-slate-300">{offerType === 'standard' ? 'Montant standard sélectionné' : 'Montant personnalisé (F$)'}</label>
              <input id="loan-amount" type="text" inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value); setOfferType('personnalise'); }} disabled={busy} className={inputClass} aria-describedby="loan-limits" />
              <p id="loan-limits" className="mt-2 text-xs text-slate-400">Personnalisé : minimum {money(MIN_PRET_PERSONNALISE)}, maximum {money(limit)}.</p>
            </div>
            <div>
              <label htmlFor="loan-days" className="mb-2 block text-sm text-slate-300">Durée en jours (3 mois maximum)</label>
              <input id="loan-days" type="number" min={1} max={MAX_DUREE_PRET} step={1} value={days} onChange={e => setDays(e.target.value)} disabled={busy} className={inputClass} />
              <div className="mt-2 flex gap-2">{[30, 60, 90].map(n => <button key={n} type="button" disabled={busy} onClick={() => setDays(String(n))} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">{n} jours</button>)}</div>
            </div>
          </div>
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm text-slate-300">Mode de remboursement</legend>
            <label className={'cursor-pointer rounded-xl border p-4 ' + (mode === 'quotidien' ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700')}>
              <input type="radio" name="loan-mode" value="quotidien" checked={mode === 'quotidien'} onChange={() => setMode('quotidien')} className="mr-2 accent-sky-500" />
              <span className="font-medium text-slate-100">Chaque jour</span>
              <span className="mt-2 block text-xs text-slate-400">Capital et intérêts répartis sur la durée choisie. Premier prélèvement après 24 heures.</span>
            </label>
            <label className={'cursor-pointer rounded-xl border p-4 ' + (mode === 'echeance' ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700')}>
              <input type="radio" name="loan-mode" value="echeance" checked={mode === 'echeance'} onChange={() => setMode('echeance')} className="mr-2 accent-sky-500" />
              <span className="font-medium text-slate-100">À l’échéance</span>
              <span className="mt-2 block text-xs text-slate-400">Un seul prélèvement automatique du capital et des intérêts à la date limite.</span>
            </label>
          </fieldset>
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4" aria-live="polite">
            {selected ? <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric label={'Intérêts sur ' + selected.dureeJours + ' jours (' + selected.tauxInteret.toLocaleString('fr-FR') + ' %)'} value={money(selected.interets)} />
                <Metric label="Total à rembourser" value={money(selected.total)} accent />
                <Metric label={mode === 'quotidien' ? 'Prélèvement par jour' : 'Prélèvement à l’échéance'} value={mode === 'echeance' ? money(selected.total) : selected.quotidienMin === selected.quotidienMax ? money(selected.quotidienMin) : money(selected.quotidienMin) + ' à ' + money(selected.quotidienMax)} />
              </div>
              <p className="mt-3 text-xs text-slate-400">Taux fixe pour la durée totale, calculé selon le montant et au prorata des jours. En quotidien, les arrondis sont répartis pour rembourser exactement le total.</p>
              {selected.montant > limit && <p className="mt-3 text-sm text-red-300">Ce montant dépasse votre capital disponible pour emprunter.</p>}
            </> : <p className="text-sm text-amber-300">Saisissez un montant personnalisé de 1 à 10 millions de F$ et une durée entière de 1 à 90 jours.</p>}
          </div>
          <p className="text-xs leading-relaxed text-amber-200/80">Un seul prêt actif par compagnie. Les nouveaux prêts ne prélèvent rien sur les recettes des vols. À la date limite, tout montant restant est débité du compte, même si cela crée un découvert. La procédure existante prévoit alors 7 jours pour régulariser avant une éventuelle vente d’actifs.</p>
          <button type="button" onClick={borrow} disabled={!canBorrow || busy} className={actionClass}>{busy ? 'Traitement…' : 'Confirmer ce prêt'}</button>
        </div>}

        {data.historique.length > 0 && <div className="card">
          <h4 className="mb-4 font-semibold text-slate-200">Prêts remboursés</h4>
          <div className="space-y-3">{data.historique.map(loan => <div key={loan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/40 p-3 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-slate-200">{money(loan.montant_emprunte)} empruntés</span></div>
            <div className="text-right"><p className="text-emerald-300">{money(loan.montant_total_du)} remboursés</p><p className="text-xs text-slate-500">{loan.rembourse_at ? date(loan.rembourse_at) : 'Soldé'}</p></div>
          </div>)}</div>
        </div>}
      </>}
    </div>
  );
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className={'mt-1 text-lg font-semibold ' + (accent ? 'text-sky-300' : 'text-slate-100')}>{value}</p></div>;
}
