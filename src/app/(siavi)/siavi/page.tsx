import Link from 'next/link';
import { SIAVI_WORKSPACES } from '@/lib/siavi/workspaces';
const colors = {
 pompier: 'border-amber-400/40 bg-amber-950/40 hover:bg-amber-900/40 text-amber-100',
 afis: 'border-cyan-400/40 bg-cyan-950/40 hover:bg-cyan-900/40 text-cyan-100',
 medevac: 'border-rose-400/40 bg-rose-950/40 hover:bg-rose-900/40 text-rose-100',
};
export default function SiaviHome() {
 return <div className="siavi-enter space-y-6"><header><p className="text-sm font-semibold text-rose-300">SIAVI · Choix de fonction</p><h1 className="mt-2 text-3xl font-bold text-white">Quel service rejoignez-vous ?</h1><p className="mt-3 max-w-2xl text-slate-300">Trois espaces distincts, un seul compte. Les missions MEDEVAC se préparent et se pilotent ici, sans passer par l’espace pilote.</p></header><div className="grid gap-4 md:grid-cols-3">{Object.entries(SIAVI_WORKSPACES).map(([mode,item])=><Link key={mode} href={item.href} className={`group rounded-2xl border p-6 transition duration-200 motion-safe:hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${colors[mode as keyof typeof colors]}`}><h2 className="text-xl font-bold">{item.label}</h2><p className="mt-3 text-sm text-slate-300">{item.description}</p><span className="mt-8 inline-block font-semibold">Ouvrir la console →</span></Link>)}</div></div>;
}
