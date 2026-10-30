'use client';
import {useCallback,useEffect,useState} from 'react';
type Status={state:{enabled:boolean;activated_at:string|null;config_version:string};checks:{ready:boolean;catalogues:boolean;reglement:boolean;protection:boolean};audit:Array<{id:string;enabled:boolean;created_at:string}>};
export default function EconomyReleaseControl(){
  const [status,setStatus]=useState<Status|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{const response=await fetch('/api/admin/economie',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);setStatus(result);},[]);
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
  async function toggle(){if(!status||busy)return;setBusy(true);setError('');try{const response=await fetch('/api/admin/economie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!status.state.enabled})});const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();}catch(e){setError(e instanceof Error?e.message:'Changement indisponible.');}finally{setBusy(false);}}
  return <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
    {error&&<p role="alert" className="mb-4 text-red-300">{error}<button onClick={()=>void refresh().catch(e=>setError(e.message))} className="ml-3 underline">Réessayer</button></p>}
    {!status&&!error&&<p role="status">Chargement du contrôle…</p>}
    {status&&<><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-slate-400">État public</p><p className={`mt-1 text-xl font-semibold ${status.state.enabled?'text-emerald-300':'text-amber-300'}`}>{status.state.enabled?'Ouvert aux compagnies':'Nouveaux projets suspendus'}</p>{status.state.activated_at&&<p className="mt-2 text-xs text-slate-500">Ouverture initiale : {new Date(status.state.activated_at).toLocaleString('fr-FR',{timeZone:'UTC'})} UTC</p>}</div><button disabled={busy||!status.state.enabled&&!status.checks.ready} onClick={()=>void toggle()} className={`min-h-11 rounded-lg px-4 font-medium disabled:opacity-40 ${status.state.enabled?'border border-amber-600 text-amber-200':'bg-emerald-600 text-white'}`}>{busy?'Traitement…':status.state.enabled?'Suspendre les nouveaux projets':'Ouvrir au public'}</button></div>
      <div className="my-6 grid gap-3 sm:grid-cols-3">{([{key:'catalogues',label:'Contenus installés'},{key:'reglement',label:'Règlement disponible'},{key:'protection',label:'Accès protégés'}] as const).map(check=><p key={check.key} className="rounded-lg border border-slate-800 p-3 text-sm"><span className={status.checks[check.key]?'text-emerald-400':'text-red-300'}>{status.checks[check.key]?'●':'○'}</span> {check.label}</p>)}</div>
      <p className="text-sm leading-6 text-slate-400">Les vols déjà déposés gardent leurs conditions. Une suspension arrête les nouveaux devis et engagements ; elle ne retire aucun salaire et n’efface aucun projet.</p>
      {status.audit.length>0&&<div className="mt-6 border-t border-slate-800 pt-4"><h2 className="mb-3 text-sm font-medium">Historique d’ouverture</h2><ul className="space-y-2 text-xs text-slate-500">{status.audit.map(row=><li key={row.id}>{new Date(row.created_at).toLocaleString('fr-FR',{timeZone:'UTC'})} UTC · {row.enabled?'Ouverture publique':'Suspension'}</li>)}</ul></div>}
    </>}
  </section>;
}
