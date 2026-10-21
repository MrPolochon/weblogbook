import Link from 'next/link';
import { ArrowRight, Flame, Radio, HeartPulse, Check } from 'lucide-react';
import { SIAVI_WORKSPACES } from '@/lib/siavi/workspaces';
const cards = [
 {key:'pompier' as const,icon:Flame,color:'amber',title:'Pompier aéroportuaire',subtitle:'Intervenir au sol',tasks:['Prendre votre service sur un aéroport','Répondre aux appels et coordonner les secours','Suivre votre rémunération de service'],pay:'100 000 F$ / heure',action:'Rejoindre le service pompier',tone:'border-amber-500/35 bg-amber-950/20 text-amber-100',button:'bg-amber-400 text-slate-950 hover:bg-amber-300'},
 {key:'afis' as const,icon:Radio,color:'cyan',title:'Pompier AFIS',subtitle:'Informer et surveiller les vols',tasks:['Prendre un poste AFIS disponible','Suivre les vols de votre aérodrome','Coordonner les transferts et les appels'],pay:'200 000 F$ / heure',action:'Rejoindre le service AFIS',tone:'border-cyan-500/35 bg-cyan-950/20 text-cyan-100',button:'bg-cyan-400 text-slate-950 hover:bg-cyan-300'},
 {key:'medevac' as const,icon:HeartPulse,color:'rose',title:'Équipage MEDEVAC',subtitle:'Préparer et effectuer une mission',tasks:['Choisir l’avion et préparer les étapes','Piloter avec votre console et le transpondeur','Terminer la mission et remplir le rapport'],pay:'Rémunération par mission',action:'Ouvrir mes missions MEDEVAC',tone:'border-rose-500/35 bg-rose-950/20 text-rose-100',button:'bg-rose-500 text-white hover:bg-rose-400'},
];
export default function SiaviHome() {
 return <div className="siavi-enter space-y-8">
  <header className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-slate-400">Centre opérationnel SIAVI</p><h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Choisissez votre activité</h1><p className="mt-4 text-base leading-relaxed text-slate-300">Chaque fonction possède sa console et ses commandes. Choisissez un service au sol ou rejoignez votre espace de vol MEDEVAC.</p></header>
  <div className="grid gap-5 lg:grid-cols-3">{cards.map(({key,icon:Icon,title,subtitle,tasks,pay,action,tone,button},index)=><section key={key} className={`flex flex-col rounded-2xl border p-5 sm:p-6 ${tone}`} aria-labelledby={`service-${key}`}>
   <div className="flex items-center justify-between"><span className="rounded-xl border border-current/20 bg-slate-950/30 p-3"><Icon className="h-7 w-7"/></span><span className="text-xs font-bold uppercase tracking-widest opacity-70">Espace {index+1}</span></div>
   <h2 id={`service-${key}`} className="mt-5 text-2xl font-bold">{title}</h2><p className="mt-1 font-medium text-slate-300">{subtitle}</p>
   <ul className="my-6 space-y-3 text-sm leading-relaxed text-slate-300">{tasks.map(task=><li key={task} className="flex items-start gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0"/><span>{task}</span></li>)}</ul>
   <div className="mt-auto border-t border-slate-700/70 pt-4"><p className="font-semibold">{pay}</p><p className="mt-1 text-xs text-slate-400">{key==='medevac'?'50 % SIAVI · 50 % à partager avec l’équipage':'+ 50 000 F$ par appel reçu et décroché'}</p><Link href={SIAVI_WORKSPACES[key].href} className={`mt-5 flex min-h-12 items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${button}`}>{action}<ArrowRight aria-hidden className="h-4 w-4 shrink-0"/></Link></div>
  </section>)}</div>
  <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm leading-relaxed text-slate-300">Vous changez d’activité ? Quittez votre service Pompier ou AFIS avant de démarrer un vol MEDEVAC. Les onglets en haut vous permettent de retrouver chaque espace.</p>
 </div>;
}
