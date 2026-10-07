'use client';
import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/fetch-json';
type Bilan = { routes: Array<{route:string;vols:number;traced:number;gross:number;net:number}>; repairs:number;outstanding:number;fleet:number;unavailable:number;truncated:boolean };
const money = (n:number)=>n.toLocaleString('fr-FR')+' F$';
export default function CompanyPerformance({id,balance}:{id:string;balance:number}) {
  const [data,setData]=useState<Bilan|null>(null); const [error,setError]=useState(''); const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true; setData(null);setError(''); void fetchJson<Bilan>(`/api/compagnies/${id}/performance`).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,attempt]);
  return <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-3">
    <h2 className="font-semibold text-sky-200">Bilan d’exploitation · 30 derniers jours</h2>
    {error && <p role="alert" className="text-amber-300">{error} <button className="underline" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></p>}
    {!data && !error && <p className="text-slate-400">Chargement du bilan…</p>}
    {data && <><div className="grid gap-3 sm:grid-cols-4 text-sm">
      <p>Trésorerie disponible<br/><strong>{money(balance)}</strong></p><p>Flotte immobilisée<br/><strong>{data.unavailable} / {data.fleet}</strong></p>
      <p>Réparations payées<br/><strong>{money(data.repairs)}</strong></p><p>Prêts à rembourser<br/><strong>{money(data.outstanding)}</strong></p>
    </div><p className="text-xs text-slate-400">Revenus après répartition et remboursements, avant coûts de maintenance. Les anciens vols sans revenu net restent exclus du calcul. Les chèques doivent encore être encaissés.</p>
    {data.routes.length===0 && <p className="text-slate-400">Aucun vol clôturé sur la période.</p>}
    <div className="space-y-2">{data.routes.map(r=><div key={r.route} className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-2 text-sm"><span>{r.route} · {r.vols} vols · {r.traced} tracés</span><span>{r.traced ? money(r.net)+(r.gross>0 ? ` · ${Math.round(r.net/r.gross*100)} % du revenu effectif` : '') : 'Revenu net non disponible'}</span></div>)}</div>
    {data.outstanding>0 && <p className="text-sm text-amber-200">Écart trésorerie / dette : {money(balance-data.outstanding)}. La durée de remboursement dépend des prochains revenus ; elle n’est pas garantie.</p>}
    {data.truncated && <p className="text-amber-300 text-xs">Bilan limité aux 1 000 opérations de la période.</p>}</>}
  </section>;
}
