'use client';

import { useMemo, useState, useTransition } from 'react';
import { Package, Search, RefreshCw, Radio, ArrowRight, Factory } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AeroportCargoData {
  code: string; nom: string; taille: 'international' | 'regional' | 'small' | 'military'; industriel: boolean;
  cargoMax: number; cargo_disponible: number; cargo_max: number; derniere_regeneration: string | null; vor?: string; freq?: string;
}
const LABELS: Record<string, string> = { international: 'International', regional: 'Régional', small: 'Petit aéroport', military: 'Militaire' };
const ratio = (airport: AeroportCargoData) => airport.cargo_max > 0 ? Math.max(0, Math.min(1, airport.cargo_disponible / airport.cargo_max)) : 0;
const quantity = (kg: number) => `${kg.toLocaleString('fr-FR')} kg`;

export default function MarcheCargoClient({ aeroports }: { aeroports: AeroportCargoData[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [size, setSize] = useState('');
  const [sort, setSort] = useState<'volume' | 'code'>('volume');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = aeroports.find(a => a.code === selectedCode);
  const filtered = useMemo(() => aeroports.filter(a => (!size || a.taille === size) && `${a.code} ${a.nom}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))).sort((a, b) => sort === 'code' ? a.code.localeCompare(b.code) : b.cargo_disponible - a.cargo_disponible || a.code.localeCompare(b.code)), [aeroports, search, size, sort]);

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
      <label className="text-xs font-medium text-slate-400">Aéroport<div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Code OACI ou nom…" className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 focus:border-sky-500 focus:outline-none" /></div></label>
      <label className="text-xs font-medium text-slate-400">Type d’aéroport<select value={size} onChange={e => setSize(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"><option value="">Tous les types</option>{Object.entries(LABELS).filter(([value]) => aeroports.some(a => a.taille === value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-400">Trier par<select value={sort} onChange={e => setSort(e.target.value as 'volume' | 'code')} className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"><option value="volume">Fret disponible</option><option value="code">Code OACI</option></select></label>
      <button type="button" onClick={() => startTransition(() => router.refresh())} disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />{pending ? 'Actualisation…' : 'Actualiser'}</button>
    </div>
    <p className="text-xs text-slate-400" role="status">{filtered.length} aéroport{filtered.length > 1 ? 's' : ''} correspondant à la sélection</p>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="overflow-x-auto rounded-xl border border-slate-700/70 bg-slate-900/60">
        <table className="w-full min-w-[540px] text-left text-sm"><caption className="sr-only">Disponibilité du fret par aéroport de départ</caption><thead className="border-b border-slate-700 bg-slate-950/40 text-xs uppercase tracking-wide text-slate-400"><tr><th scope="col" className="px-4 py-3">Aéroport</th><th scope="col" className="px-4 py-3">Type</th><th scope="col" className="px-4 py-3 text-right">Disponible</th><th scope="col" className="px-4 py-3 text-right">Stock restant</th></tr></thead><tbody className="divide-y divide-slate-800">
          {filtered.map(airport => <tr key={airport.code} className={selectedCode === airport.code ? 'bg-sky-950/40' : 'hover:bg-slate-800/40'}><td className="px-4 py-3"><button type="button" onClick={() => setSelectedCode(airport.code)} aria-pressed={selectedCode === airport.code} className="min-h-10 w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><span className="block font-mono font-semibold text-sky-300">{airport.code}</span><span className="mt-1 block text-xs text-slate-400">{airport.nom}</span></button></td><td className="px-4 py-3 text-xs text-slate-400">{LABELS[airport.taille]}{airport.industriel && <span className="mt-1 flex items-center gap-1 text-slate-300"><Factory className="h-3 w-3" /> Industriel</span>}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-200">{quantity(airport.cargo_disponible)}</td><td className="px-4 py-3 text-right tabular-nums"><span className={ratio(airport) < .3 ? 'text-amber-300' : 'text-slate-300'}>{Math.round(ratio(airport) * 100)} %</span><span className="mt-1 block text-xs text-slate-500">sur {quantity(airport.cargo_max)}</span></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">{aeroports.length ? 'Aucun aéroport ne correspond aux filtres.' : 'Aucune disponibilité de fret n’a été transmise.'}{aeroports.length > 0 && <button onClick={() => { setSearch(''); setSize(''); }} className="mx-auto mt-3 block min-h-10 text-sky-400 underline">Effacer les filtres</button>}</td></tr>}
        </tbody></table>
      </div>
      <aside className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5" aria-label="Fiche de l’aéroport sélectionné">
        {selected ? <><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Station de départ</p><h2 className="mt-2 font-mono text-xl font-semibold text-sky-300">{selected.code}</h2><p className="mt-1 text-sm text-slate-300">{selected.nom}</p><dl className="my-5 space-y-3 border-y border-slate-800 py-4"><div className="flex justify-between gap-3"><dt className="text-xs text-slate-400">Fret disponible</dt><dd className="text-sm font-semibold tabular-nums text-slate-100">{quantity(selected.cargo_disponible)}</dd></div><div className="flex justify-between gap-3"><dt className="text-xs text-slate-400">Type</dt><dd className="text-xs text-slate-300">{LABELS[selected.taille]}</dd></div></dl>{selected.vor && <div className="mb-5 flex items-center gap-2 text-xs text-slate-300"><Radio className="h-4 w-4 text-sky-400" /><span className="font-mono">{selected.vor}{selected.freq ? ` · ${selected.freq} MHz` : ''}</span></div>}<Link href="/logbook/depot-plan-vol" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-sky-400">Préparer le plan de vol<ArrowRight className="h-4 w-4" /></Link><p className="mt-4 text-xs leading-relaxed text-slate-500">La disponibilité ne constitue pas une réservation. Le chargement et les conditions de transport sont vérifiés lors du dépôt.</p></> : <div className="py-6 text-center"><Package className="mx-auto h-7 w-7 text-slate-500" /><h2 className="mt-4 text-sm font-semibold text-slate-200">Fiche aéroport</h2><p className="mt-2 text-xs leading-relaxed text-slate-400">Sélectionnez un code OACI dans le tableau pour consulter sa disponibilité et ses informations radio.</p></div>}
      </aside>
    </div>
  </div>;
}
