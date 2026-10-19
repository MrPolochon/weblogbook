'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {handoverWarningStage} from '@/lib/events/handover-rules';
type Status={session:{id:string;aeroport:string;position:string}|null;reservation?:{id:string;starts_at:string}|null;serverNow:string};
export default function AtcReservationHandover({enService}:{enService:boolean}) {
  const router=useRouter();
  const [status,setStatus]=useState<Status|null>(null);
  const [now,setNow]=useState(Date.now());
  const [error,setError]=useState(false);
  const [audioBlocked,setAudioBlocked]=useState(false);
  const offset=useRef(0),busy=useRef(false),context=useRef<AudioContext|null>(null),last=useRef('');
  const check=useCallback(async()=>{
    if(busy.current) return; busy.current=true;
    try {
      const res=await fetch('/api/atc/reservation-status',{cache:'no-store'});
      if(!res.ok) throw new Error();
      const next:Status=await res.json(); offset.current=Date.parse(next.serverNow)-Date.now();
      setStatus(next);setError(false);setNow(Date.now()+offset.current);
      if(!next.session) router.refresh();
    }catch{setError(true);}finally{busy.current=false;}
  },[router]);
  useEffect(()=>{
    if(!enService) return;
    void check();const poll=setInterval(()=>void check(),15000);
    const clock=setInterval(()=>setNow(Date.now()+offset.current),250);
    const activate=()=>{
      try{context.current??=new AudioContext();void context.current.resume().then(()=>setAudioBlocked(context.current?.state!=='running'));}catch{setAudioBlocked(true);}
    };
    const visible=()=>{if(!document.hidden) void check();};
    window.addEventListener('pointerdown',activate);window.addEventListener('keydown',activate);document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(poll);clearInterval(clock);window.removeEventListener('pointerdown',activate);window.removeEventListener('keydown',activate);document.removeEventListener('visibilitychange',visible);void context.current?.close();context.current=null;};
  },[enService,check]);
  const booking=status?.reservation;
  const start=booking?Date.parse(booking.starts_at):Infinity;
  const stage=handoverWarningStage(start,now);
  useEffect(()=>{
    if(!enService||!booking||!stage) return;
    const key=`atc-handover:${status?.session?.id}:${booking.id}:${stage}`;
    if(last.current===key) return;
    const ctx=context.current;
    if(!ctx||ctx.state!=='running'){setAudioBlocked(true);return;}
    last.current=key;
    try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch{/* in-memory deduplication */}
    for(let n=0;n<stage+1;n++){
      const tone=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+n*.22;
      tone.frequency.value=n%2?880:660;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.12,at+.02);gain.gain.linearRampToValueAtTime(0,at+.18);
      tone.connect(gain);gain.connect(ctx.destination);tone.onended=()=>{tone.disconnect();gain.disconnect();};tone.start(at);tone.stop(at+.2);
    }
  },[enService,booking,stage,status?.session?.id,audioBlocked]);
  useEffect(()=>{
    if(!enService||!booking) return;
    const delay=Math.max(0,start-(Date.now()+offset.current));
    const timer=setTimeout(()=>void check(),Math.min(delay,2147483647));
    return()=>clearTimeout(timer);
  },[enService,booking,start,check]);
  if(!enService) return null;
  if(error) return <div role="status" className="shrink-0 bg-amber-950 px-4 py-2 text-amber-100">Vérification de relève indisponible. La réservation reste appliquée côté serveur.</div>;
  if(!booking||(!stage&&now<start)) return null;
  const seconds=Math.max(0,Math.ceil((start-now)/1000));
  return <div role="alert" className={`shrink-0 border-b px-4 py-3 font-semibold ${stage===3||seconds===0?'border-red-500 bg-red-950 text-red-100':'border-amber-500 bg-amber-950 text-amber-100'}`}>
    {seconds===0?'Créneau réservé commencé : fin de service automatique en cours.':`Avertissement ${stage}/3 — ${status?.session?.aeroport} ${status?.session?.position} réservé dans ${Math.floor(seconds/60)} min ${String(seconds%60).padStart(2,'0')} s.`}
    <p className="text-sm font-normal">Libérez la position avant {new Date(start).toLocaleTimeString('fr-FR',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'})} UTC. À l’échéance, votre service sera terminé et vos vols passeront en autosurveillance. Votre rémunération est conservée.</p>
    {audioBlocked&&<p className="text-sm">Cliquez dans la page pour autoriser les avertissements sonores.</p>}
  </div>;
}
