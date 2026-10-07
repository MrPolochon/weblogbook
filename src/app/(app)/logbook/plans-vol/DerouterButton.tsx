'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {AEROPORTS_PTFS} from '@/lib/aeroports-ptfs';
import {fetchJson} from '@/lib/fetch-json';
export default function DerouterButton({planId,destination}:{planId:string;destination:string}) {
 const router=useRouter(); const [open,setOpen]=useState(false);const [airport,setAirport]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit() {setBusy(true);setError('');try{await fetchJson('/api/plans-vol/'+planId+'/deroutement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aeroport:airport})});setOpen(false);router.refresh();}catch(e){setError(e instanceof Error?e.message:'Déroutement impossible.');}finally{setBusy(false);}}
 return <div>{!open?<button onClick={()=>setOpen(true)} className="rounded-lg border border-orange-500/60 px-3 py-2 text-orange-200 text-sm">Dérouter le vol</button>:<div className="rounded-xl border border-orange-400/40 p-4 space-y-3 bg-slate-900"><label className="block text-sm">Aéroport de déroutement<select className="input mt-1" value={airport} onChange={e=>setAirport(e.target.value)}><option value="">Choisir un aéroport</option>{AEROPORTS_PTFS.filter(a=>a.code!==destination).map(a=><option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}</select></label><p className="text-xs text-orange-200">À la clôture : recette ÷2, taxes de la nouvelle destination ×20. Le salaire reste dû et la compagnie prend en charge le déficit éventuel. Ces règles s’appliquent avec ou sans ATC.</p>{error&&<p role="alert" className="text-red-300">{error}</p>}<div className="flex gap-2"><button disabled={busy||!airport} onClick={()=>void submit()} className="btn-primary">{busy?'Enregistrement…':'Confirmer le déroutement'}</button><button disabled={busy} onClick={()=>setOpen(false)} className="btn-secondary">Annuler</button></div></div>}</div>;
}
