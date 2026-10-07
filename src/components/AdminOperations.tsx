'use client';
import { useEffect,useState } from 'react';
import { fetchJson } from '@/lib/fetch-json';
type Health={queues:Array<{count:number|null;unavailable:boolean}>;email:{configured:boolean;domain:string;webhookConfigured:boolean;dmarc:boolean;events:Array<{event_type:string;occurred_at:string;provider_message_id:string}>;unavailable:boolean};observedAt:string};
export default function AdminOperations(){
 const [data,setData]=useState<Health|null>(null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;void fetchJson<Health>('/api/admin/operations').then(d=>{if(active){setData(d);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[attempt]);
 return <section className="rounded-xl border border-slate-700 p-5 space-y-3"><div className="flex justify-between"><h2 className="font-semibold text-sky-200">Santé du réseau</h2><button className="text-sm underline" onClick={()=>setAttempt(n=>n+1)}>Actualiser</button></div>
 {error && <p role="alert" className="text-amber-300">{error}</p>}{!data && !error && <p>Chargement…</p>}
 {data && <><div className="grid sm:grid-cols-3 gap-3">{['Services au sol en attente depuis plus d’une heure','Clôtures ATC en attente depuis plus d’une heure','Vols clôturés sans revenu net sur 24 h'].map((label,i)=><p key={label} className="text-sm">{label}<br/><strong>{data.queues[i].unavailable?'Indisponible':data.queues[i].count}</strong></p>)}</div>
 <div className="border-t border-slate-700 pt-3 text-sm space-y-1"><p>Email : {data.email.configured?'expéditeur configuré':'configuration à corriger'} · {data.email.domain || 'domaine manquant'}</p><p>Politique DMARC : {data.email.dmarc?'présente':'non détectée'} · suivi des livraisons : {data.email.webhookConfigured?'configuré':'à connecter chez le prestataire'}</p>
 <p className="text-slate-400 text-xs">La présence des paramètres ne garantit pas la livraison. Vérifier SPF/DKIM et les refus chez le prestataire.</p>
 {data.email.unavailable && <p className="text-amber-300">Journal de livraison indisponible.</p>}
 {data.email.events.slice(0,10).map(e=><p key={e.provider_message_id+e.event_type+e.occurred_at} className="font-mono text-xs">{e.event_type} · {e.provider_message_id} · {new Date(e.occurred_at).toLocaleString('fr-FR')}</p>)}
 {!data.email.events.length && <p className="text-slate-400">Aucun événement de livraison reçu sur 24 h.</p>}</div>
 <a className="text-sm underline" href="https://supabase.com/dashboard/project/iajcynzzybkomaouxwji/logs" target="_blank" rel="noreferrer">Consulter les erreurs de la base et de l’API</a></>}
 </section>;
}
