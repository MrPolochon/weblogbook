'use client';

import { useState } from 'react';
import { Users, Package, ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import MarchePassagersClient from './MarchePassagersClient';
import MarcheCargoClient from './MarcheCargoClient';

interface PassagerAeroport {
  code: string; nom: string; taille: 'international' | 'regional' | 'small' | 'military'; tourisme: boolean;
  passagersMax: number; passagers_disponibles: number; passagers_max: number; derniere_regeneration: string | null; vor?: string; freq?: string;
}
interface CargoAeroport {
  code: string; nom: string; taille: 'international' | 'regional' | 'small' | 'military'; industriel: boolean;
  cargoMax: number; cargo_disponible: number; cargo_max: number; derniere_regeneration: string | null; vor?: string; freq?: string;
}
interface Props { passagersAeroports: PassagerAeroport[]; cargoAeroports: CargoAeroport[]; alerteMarche?: string | null; initialTab?: 'passagers' | 'cargo'; }

export default function MarcheClient({ passagersAeroports, cargoAeroports, alerteMarche, initialTab = 'passagers' }: Props) {
  const [activeTab, setActiveTab] = useState<'passagers' | 'cargo'>(initialTab);
  const totalPax = passagersAeroports.reduce((sum, a) => sum + a.passagers_disponibles, 0);
  const totalCargo = cargoAeroports.reduce((sum, a) => sum + a.cargo_disponible, 0);
  const lastUpdate = [...passagersAeroports, ...cargoAeroports].map(a => a.derniere_regeneration).filter((value): value is string => !!value && Number.isFinite(Date.parse(value))).sort().at(-1);
  const lastUpdateText = lastUpdate ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(lastUpdate)) + ' UTC' : 'Mise à jour non datée';
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/70 pb-6">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Préparation commerciale</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Demande passagers et fret</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Comparez les disponibilités connues au départ avant de choisir votre liaison. Le chargement définitif reste calculé lors du dépôt.</p></div>
      <Link href="/logbook/depot-plan-vol" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500">Préparer un vol<ArrowRight className="h-4 w-4" /></Link>
    </header>
    {alerteMarche && <div role="status" className="rounded-xl border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">{alerteMarche}</div>}
    <dl className="grid gap-px overflow-hidden rounded-xl border border-slate-700/70 bg-slate-700/70 sm:grid-cols-3">
      <div className="bg-slate-900 px-5 py-4"><dt className="flex items-center gap-2 text-xs text-slate-400"><Users className="h-4 w-4" /> Passagers disponibles</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{passagersAeroports.length ? totalPax.toLocaleString('fr-FR') : '—'}</dd></div>
      <div className="bg-slate-900 px-5 py-4"><dt className="flex items-center gap-2 text-xs text-slate-400"><Package className="h-4 w-4" /> Fret disponible</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{cargoAeroports.length ? totalCargo.toLocaleString('fr-FR') : '—'} <span className="text-sm text-slate-400">kg</span></dd></div>
      <div className="bg-slate-900 px-5 py-4"><dt className="flex items-center gap-2 text-xs text-slate-400"><MapPin className="h-4 w-4" /> Couverture connue</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{new Set([...passagersAeroports, ...cargoAeroports].map(a => a.code)).size} <span className="text-sm text-slate-400">aéroports</span></dd></div>
    </dl>
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-700/70">
      <div role="tablist" aria-label="Activité commerciale" className="flex gap-1">
        {([{ id: 'passagers', label: 'Passagers', icon: Users }, { id: 'cargo', label: 'Fret', icon: Package }] as const).map(tab => <button key={tab.id} id={`market-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`market-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${activeTab === tab.id ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><tab.icon className="h-4 w-4" />{tab.label}</button>)}
      </div><p className="pb-3 text-xs text-slate-500">Dernière régénération connue : {lastUpdateText}</p>
    </div>
    {activeTab === 'passagers' ? <section role="tabpanel" id="market-panel-passagers" aria-labelledby="market-tab-passagers"><MarchePassagersClient aeroports={passagersAeroports} /></section> : <section role="tabpanel" id="market-panel-cargo" aria-labelledby="market-tab-cargo"><MarcheCargoClient aeroports={cargoAeroports} /></section>}
  </div>;
}
