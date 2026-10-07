'use client';
import { useEffect,useState } from 'react';
import { fetchJson } from '@/lib/fetch-json';
type Service={id:string;statut:string;requested_at:string;accepted_at:string|null;completed_at:string|null};
export default function GroundQueueSummary({aeroport,gateQueue}:{aeroport:string;gateQueue:Array<{gate:string;pending:number}>}){
 const [stats,setStats]=useState<{median:number;p95:number;count:number}|null>(null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;void fetchJson<{requests:Service[]}>(`/api/ground/service-requests?aeroport=${encodeURIComponent(aeroport)}&statut=completed`).then(d=>{
   const times=d.requests.map(r=>r.accepted_at?(Date.parse(r.accepted_at)-Date.parse(r.requested_at))/60000:NaN).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
   if(active){setError('');setStats(times.length?{count:times.length,median:times[Math.ceil(times.length*.5)-1],p95:times[Math.ceil(times.length*.95)-1]}:null);}
 }).catch(()=>{if(active)setError('Les délais de prise en charge sont indisponibles.');});return()=>{active=false;};},[aeroport,attempt]);
 return <section className="rounded-xl border border-slate-700 p-4 text-sm space-y-2"><div className="flex justify-between"><h2 className="font-semibold text-emerald-300">File au sol et délais</h2><button className="underline" onClick={()=>setAttempt(n=>n+1)}>Actualiser</button></div>
 {error && <p role="alert" className="text-amber-300">{error}</p>}{stats && <p>Prise en charge : médiane {stats.median.toFixed(1)} min · 95 % en moins de {stats.p95.toFixed(1)} min · {stats.count} services récents</p>}
 {!stats && !error && <p className="text-slate-400">Pas encore de délai mesuré.</p>}
 <div className="flex flex-wrap gap-3">{gateQueue.map(g=><span key={g.gate} className="rounded-lg bg-slate-800 px-3 py-2">{g.gate} : {g.pending} en attente</span>)}</div></section>;
}
