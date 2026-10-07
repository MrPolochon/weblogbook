'use client';
import { useEffect,useState } from 'react';
export default function AtisDraftPreview({text,ready}:{text:string;ready:boolean}) {
 const [playing,setPlaying]=useState(false); const [error,setError]=useState('');
 useEffect(()=>()=>{window.speechSynthesis?.cancel();},[]);
 function play() {
  if(!('speechSynthesis' in window)){setError('Aperçu audio indisponible sur ce navigateur.');return;}
  window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.85;
  utterance.onend=()=>setPlaying(false);utterance.onerror=()=>{setPlaying(false);setError('Lecture impossible. Vérifiez la sortie audio.');};setError('');setPlaying(true);window.speechSynthesis.speak(utterance);
 }
 return <details className="rounded-lg border border-slate-600 p-3 text-sm"><summary className="cursor-pointer font-semibold">Aperçu texte et audio du brouillon</summary><p className="mt-3 whitespace-pre-line">{text}</p><div className="flex gap-3 mt-3"><button type="button" disabled={!ready} onClick={play} className="rounded bg-sky-700 px-3 py-2 disabled:opacity-50">Écouter</button>{playing && <button type="button" onClick={()=>{window.speechSynthesis.cancel();setPlaying(false);}}>Arrêter</button>}</div>{error && <p role="alert">{error}</p>}<p className="mt-2 text-xs text-slate-400">Voix de votre navigateur, sans diffusion Discord. La voix et le texte définitifs du bot peuvent différer.</p></details>;
}
