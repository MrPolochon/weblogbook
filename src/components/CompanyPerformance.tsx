'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Info, RefreshCw } from 'lucide-react';
import { fetchJson } from '@/lib/fetch-json';

type Bilan = {
  routes: Array<{ route: string; vols: number; traced: number; gross: number; net: number }>;
  repairs: number;
  outstanding: number;
  fleet: number;
  unavailable: number;
  truncated: boolean;
  economyTotals?: { receipts: number; fuel: number; taxes: number; salaries: number; transition: number; result: number; settledFlights: number };
};
const money = (value: number) => `${value.toLocaleString('fr-FR')} F$`;

export default function CompanyPerformance({ id, balance }: { id: string; balance: number }) {
  const [data, setData] = useState<Bilan | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    void fetchJson<Bilan>(`/api/compagnies/${id}/performance`)
      .then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Le bilan est temporairement indisponible.'); });
    return () => { active = false; };
  }, [id, attempt]);

  return <section aria-label="Bilan d’exploitation de la compagnie" className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/80">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Bilan d’exploitation</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">Situation de la compagnie et résultats par liaison.</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs text-slate-300">
        <CalendarDays aria-hidden className="h-3.5 w-3.5 text-slate-400" /> Vols · 30 derniers jours
      </span>
    </header>

    {error && <div role="alert" className="m-4 rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-sm sm:m-5">
      <p className="font-medium text-amber-200">Le bilan n’a pas pu être chargé.</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{error}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-700/60 px-3 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-900/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
        <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Réessayer
      </button>
    </div>}

    {!data && !error && <div role="status" className="space-y-5 p-4 sm:p-5">
      <p className="text-sm text-slate-400">Chargement du bilan…</p>
      <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(item => <div key={item} className="h-20 rounded-lg bg-slate-800/60 motion-safe:animate-pulse" />)}
      </div>
    </div>}

    {data && <>
      <dl className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-4">
        <Metric label="Trésorerie disponible" value={money(balance)} hint="Solde actuel" color={balance < 0 ? 'text-rose-300' : 'text-emerald-300'} />
        <Metric label="Appareils indisponibles" value={<>{data.unavailable} <span className="text-sm font-normal text-slate-500">/ {data.fleet}</span></>} hint="Non disponibles au sol" />
        <Metric label="Réparations réglées" value={money(data.repairs)} hint="Demandes de la période" />
        <Metric label="Prêts à rembourser" value={money(data.outstanding)} hint="Encours actuel" />
      </dl>

      {data.economyTotals && data.economyTotals.settledFlights > 0 && <section aria-label="Détail des nouveaux règlements" className="mx-4 mb-5 rounded-lg border border-slate-700/70 bg-slate-950/35 p-3 sm:mx-5 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-200">Nouveaux règlements</h3><span className="text-xs text-slate-500">{data.economyTotals.settledFlights} vol{data.economyTotals.settledFlights > 1 ? 's' : ''} · 30 derniers jours</span></div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Recettes', data.economyTotals.receipts],
            ['Carburant', data.economyTotals.fuel],
            ['Taxes aéroportuaires', data.economyTotals.taxes],
            ['Salaires', data.economyTotals.salaries],
            ['Aide de transition', data.economyTotals.transition],
            ['Résultat compagnie', data.economyTotals.result],
          ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[11px] leading-relaxed text-slate-500">{label}</dt><dd className={`mt-1 break-words text-sm font-semibold tabular-nums ${label === 'Résultat compagnie' ? Number(value) < 0 ? 'text-rose-300' : 'text-emerald-300' : 'text-slate-300'}`}>{money(Number(value))}</dd></div>)}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Résultat après partage des recettes et remboursements des prêts. Les coûts de maintenance restent présentés séparément.</p>
      </section>}

      <div className="border-t border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-200">Résultats par liaison</h3>
          <span className="text-xs text-slate-500">Vols clôturés</span>
        </div>
        {data.routes.length === 0 ? <div className="mx-4 mb-4 rounded-lg border border-dashed border-slate-700 px-4 py-7 text-center sm:mx-5 sm:mb-5">
          <p className="text-sm font-medium text-slate-300">Aucun vol clôturé sur la période.</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">Les résultats de vos liaisons apparaîtront ici après la clôture des vols.</p>
        </div> : <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Revenus nets renseignés par liaison pour les vols clôturés sur les trente derniers jours.</caption>
          <thead className="border-y border-slate-800 bg-slate-950/40 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Liaison</th>
              <th scope="col" className="hidden w-20 px-3 py-2.5 text-right font-medium sm:table-cell">Vols</th>
              <th scope="col" className="hidden w-28 px-3 py-2.5 text-right font-medium md:table-cell">Revenus renseignés</th>
              <th scope="col" className="w-[46%] px-4 py-2.5 text-right font-medium sm:w-48 sm:px-5">Revenu net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {data.routes.map(route => <tr key={route.route} className="transition-colors hover:bg-slate-800/30">
              <th scope="row" className="px-4 py-3 text-left font-medium text-slate-200 sm:px-5">
                <span className="break-words font-mono text-xs sm:text-sm">{route.route}</span>
                <span className="mt-1 block text-[11px] font-normal text-slate-500 md:hidden">
                  <span className="sm:hidden">{route.vols} vol{route.vols > 1 ? 's' : ''} · </span>
                  {route.traced} revenu{route.traced > 1 ? 's' : ''} renseigné{route.traced > 1 ? 's' : ''}
                </span>
              </th>
              <td className="hidden px-3 py-3 text-right tabular-nums text-slate-400 sm:table-cell">{route.vols}</td>
              <td className="hidden px-3 py-3 text-right tabular-nums text-slate-400 md:table-cell">{route.traced}</td>
              <td className="px-4 py-3 text-right sm:px-5">
                {route.traced ? <>
                  <span className="block break-words font-semibold tabular-nums text-slate-100">{money(route.net)}</span>
                  {route.gross > 0 && <span className="mt-1 block text-[11px] tabular-nums text-slate-500">{Math.round(route.net / route.gross * 100)} % du revenu effectif</span>}
                </> : <span className="text-xs text-slate-500">Non renseigné</span>}
              </td>
            </tr>)}
          </tbody>
        </table>}
      </div>

      <footer className="space-y-3 border-t border-slate-800 bg-slate-950/25 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Revenus après répartition et remboursements, avant coûts de maintenance. Les anciens vols sans revenu net restent exclus du calcul. Les nouveaux règlements sont versés directement sur Felitz Bank ; seuls les anciens chèques restent à encaisser.</p>
        </div>
        {data.outstanding > 0 && <p className="rounded-md border border-amber-800/40 bg-amber-950/15 px-3 py-2 text-xs leading-relaxed text-amber-200/90">Écart trésorerie / dette : <strong className="tabular-nums">{money(balance - data.outstanding)}</strong>. La durée de remboursement dépend des prochains revenus ; elle n’est pas garantie.</p>}
        {data.truncated && <p className="text-xs text-amber-300">Bilan limité aux 1 000 opérations de la période.</p>}
      </footer>
    </>}
  </section>;
}

function Metric({ label, value, hint, color = 'text-slate-100' }: { label: string; value: ReactNode; hint: string; color?: string }) {
  return <div className="min-w-0 rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-3">
    <dt className="text-xs font-medium text-slate-400">{label}</dt>
    <dd className={`mt-2 break-words text-lg font-semibold tabular-nums ${color}`}>{value}</dd>
    <dd className="mt-1 text-[11px] text-slate-500">{hint}</dd>
  </div>;
}
