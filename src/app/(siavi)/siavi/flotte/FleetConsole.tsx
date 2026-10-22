'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plane, Wrench, MapPin, ShoppingCart, Search } from 'lucide-react';
import { calculerPrixHub } from '@/lib/compagnie-utils';
type Model = {
    id: string;
    nom: string;
    categorie: string | null;
    prix: number;
};
type Aircraft = {
    id: string;
    immatriculation: string;
    nom_personnalise: string | null;
    aeroport_actuel: string;
    statut: string;
    usure_percent: number;
    maintenance_fin_at: string | null;
    busy: boolean;
    types_avion: Model | null;
};
type Hub = {
    id: string;
    aeroport_oaci: string;
    is_principal: boolean;
};
const money = (n: number) => Number(n).toLocaleString('fr-FR') + ' F$';
const statuses: Record<string, string> = { ground: 'Au sol', in_flight: 'En vol', maintenance: 'Immobilisé', bloque: 'Bloqué', en_reparation: 'En réparation' };
const button = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-40';
const field = 'min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-white';
export default function FleetConsole({ chief, aircraft, hubs, balance, catalogue }: {
    chief: boolean;
    aircraft: Aircraft[];
    hubs: Hub[];
    balance: number;
    catalogue: Model[];
}) {
    const router = useRouter();
    const [tab, setTab] = useState('fleet');
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('all');
    const [state, setState] = useState('all');
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [selected, setSelected] = useState<Aircraft | null>(null);
    const [name, setName] = useState('');
    const [confirmation, setConfirmation] = useState<{
        url: string;
        method: string;
        body: object;
        label: string;
    } | null>(null);
    const [model, setModel] = useState('');
    const [purchaseName, setPurchaseName] = useState('');
    const [hub, setHub] = useState('');
    const [principal, setPrincipal] = useState(false);
    async function send(url: string, method: string, body: object) { setPending(true); setMessage(''); try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Opération impossible');
        setMessage(data.message || 'Modification enregistrée.');
        setConfirmation(null);
        setSelected(null);
        router.refresh();
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : 'Erreur réseau');
    }
    finally {
        setPending(false);
    } }
    const available = (a: Aircraft) => a.statut === 'ground' && !a.busy && Number(a.usure_percent) > 0;
    const filtered = aircraft.filter(a => (kind === 'all' || (kind === 'helicopter') === (a.types_avion?.categorie === 'helicoptere')) && (state === 'all' || (state === 'available' ? available(a) : !available(a))) && `${a.immatriculation} ${a.nom_personnalise ?? ''} ${a.types_avion?.nom} ${a.aeroport_actuel}`.toLowerCase().includes(query.toLowerCase()));
    const chosen = catalogue.find(m => m.id === model);
    const basePrice = calculerPrixHub(hubs.length + 1);
    return <div className="siavi-workspace siavi-enter space-y-6">
  <header className="rounded-2xl border border-rose-500/30 bg-slate-900 p-6"><p className="text-xs font-bold tracking-widest text-rose-300">SERVICE AÉRIEN MÉDICAL</p><h1 className="mt-2 text-3xl font-bold text-white">Gestion de la flotte MEDEVAC</h1><p className="mt-3 text-slate-300">Avions et hélicoptères dédiés aux missions sanitaires. {chief ? 'Vous gérez les achats, les bases et la disponibilité des appareils.' : 'Consultez les disponibilités avant de préparer une mission. La gestion est réservée au chef de brigade.'}</p><div className="mt-5 flex flex-wrap gap-3"><Link className={button} href="/siavi/medevac">Missions MEDEVAC</Link><Link className={button} href="/siavi/felitz-bank">Banque SIAVI</Link>{chief && <Link className={button} href="/siavi/brigade">Équipe et grades</Link>}</div></header>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Appareils', aircraft.length], ['Disponibles', aircraft.filter(available).length], ['Indisponibles', aircraft.filter(a => !available(a)).length], ['Budget SIAVI', money(balance)]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}</div>
  <nav aria-label="Gestion MEDEVAC" className="flex flex-wrap gap-2">{[['fleet', 'Flotte', Plane], ['bases', 'Bases', MapPin], ...(chief ? [['buy', 'Acheter un appareil', ShoppingCart]] : [])].map(([id, label, Icon]) => { const I = Icon as typeof Plane; return <button key={String(id)} aria-pressed={tab === id} onClick={() => setTab(String(id))} className={`${button} ${tab === id ? '!border-rose-400 !bg-rose-950' : ''}`}><I className="h-4 w-4"/>{String(label)}</button>; })}</nav>
  {message && <p role="status" className="rounded-xl border border-sky-500/40 bg-slate-900 p-4 text-sky-100">{message}</p>}
  {tab === 'fleet' && <section className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><label className="text-sm text-slate-300"><span className="mb-2 flex items-center gap-2"><Search className="h-4 w-4"/>Rechercher un appareil</span><input className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Immatriculation, modèle, base…"/></label><label className="text-sm text-slate-300">Type d’appareil<select className={field + ' mt-2'} value={kind} onChange={e => setKind(e.target.value)}><option value="all">Avions et hélicoptères</option><option value="plane">Avions</option><option value="helicopter">Hélicoptères</option></select></label><label className="text-sm text-slate-300">Disponibilité<select className={field + ' mt-2'} value={state} onChange={e => setState(e.target.value)}><option value="all">Tous les appareils</option><option value="available">Disponibles</option><option value="unavailable">Indisponibles</option></select></label></div>
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(a => <article key={a.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-mono text-xl font-bold text-white">{a.immatriculation}</h2><span className={`rounded-lg px-2 py-1 text-xs font-bold ${available(a) ? 'bg-emerald-950 text-emerald-200' : 'bg-amber-950 text-amber-200'}`}>{a.busy ? 'Engagé en mission' : statuses[a.statut] ?? a.statut}</span></div><p className="mt-3 text-slate-200">{a.types_avion?.nom ?? 'Modèle inconnu'} · {a.types_avion?.categorie === 'helicoptere' ? 'Hélicoptère' : 'Avion'}</p>{a.nom_personnalise && <p className="mt-1 text-sm text-slate-400">{a.nom_personnalise}</p>}<p className="mt-4 flex items-center gap-2 text-sm text-slate-300"><MapPin className="h-4 w-4"/>Position : {a.aeroport_actuel}</p><p className="mt-3 text-sm text-slate-300">État de santé : {Number(a.usure_percent)} %</p><progress aria-label={`État de ${a.immatriculation}`} max={100} value={Number(a.usure_percent)} className="mt-2 h-2 w-full accent-emerald-400"/>{a.maintenance_fin_at && <p className="mt-2 text-sm text-amber-200">Fin prévue : {new Date(a.maintenance_fin_at).toLocaleString('fr-FR')}</p>}<div className="mt-5 flex flex-wrap gap-2">{available(a) && <Link className={button + ' !border-rose-500 !bg-rose-950'} href={`/siavi/medevac/nouveau?appareil=${a.id}`}>Préparer une mission</Link>}{chief && <button className={button} disabled={a.busy || a.statut === 'in_flight'} onClick={() => { setSelected(a); setName(a.nom_personnalise ?? ''); }}><Wrench className="h-4 w-4"/>Gérer</button>}</div></article>)}</div>{!filtered.length && <p className="rounded-xl border border-dashed border-slate-600 p-8 text-center text-slate-300">Aucun appareil ne correspond à ces critères.</p>}<p className="text-sm text-slate-400">La position est mise à jour par les vols. Un appareil engagé reste indisponible jusqu’à la fin ou l’annulation de sa mission.</p></section>}
  {tab === 'bases' && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6"><h2 className="text-xl font-bold text-white">Bases opérationnelles</h2><p className="mt-2 text-sm text-slate-300">Les nouveaux appareils sont livrés à la base principale. Les réparations se font dans une base MEDEVAC.</p><div className="mt-5 flex flex-wrap gap-3">{hubs.map(h => <p key={h.id} className="rounded-xl border border-slate-600 p-4 font-mono text-white">{h.aeroport_oaci}{h.is_principal ? ' · Principale' : ''}</p>)}{!hubs.length && <p className="text-amber-200">Aucune base. Livraison par défaut à IRFD.</p>}</div>{chief && <form onSubmit={e => { e.preventDefault(); setConfirmation({ url: '/api/siavi/hubs', method: 'POST', body: { aeroport_oaci: hub, is_principal: principal }, label: `Créer la base ${hub} pour ${money(basePrice)}` }); }} className="mt-6 space-y-4 border-t border-slate-700 pt-6"><h3 className="font-semibold text-white">Ajouter une base · {money(basePrice)}</h3><label className="block text-sm text-slate-300">Code OACI<input required maxLength={4} className={field + ' mt-2'} value={hub} onChange={e => setHub(e.target.value.toUpperCase())} placeholder="IRFD"/></label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={principal} onChange={e => setPrincipal(e.target.checked)}/>Définir comme base principale</label><button className={button} disabled={pending || balance < basePrice}>Vérifier l’achat de la base</button></form>}</section>}
  {tab === 'buy' && chief && <form onSubmit={e => { e.preventDefault(); if (chosen)
        setConfirmation({ url: '/api/marketplace', method: 'POST', body: { type_avion_id: model, pour_siavi: true, nom_personnalise: purchaseName }, label: `Acheter ${chosen.nom} pour ${money(chosen.prix)} depuis le compte SIAVI` }); }} className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6"><h2 className="text-xl font-bold text-white">Acheter pour le service MEDEVAC</h2><p className="text-sm text-slate-300">Le compte SIAVI finance l’achat. L’appareil rejoint exclusivement la flotte sanitaire, à {hubs.find(h => h.is_principal)?.aeroport_oaci ?? 'IRFD'}. Les ruptures de stock sont vérifiées à l’achat.</p><label className="block text-sm text-slate-300">Appareil<select required className={field + ' mt-2'} value={model} onChange={e => setModel(e.target.value)}><option value="">Choisir un modèle</option>{catalogue.map(m => <option key={m.id} value={m.id}>{m.categorie === 'helicoptere' ? 'Hélicoptère' : 'Avion'} · {m.nom} · {money(m.prix)}</option>)}</select></label><label className="block text-sm text-slate-300">Nom de l’appareil (facultatif)<input maxLength={80} className={field + ' mt-2'} value={purchaseName} onChange={e => setPurchaseName(e.target.value)}/></label>{chosen && <p className="text-lg font-bold text-rose-200">Prix : {money(chosen.prix)} · Solde après achat : {money(balance - chosen.prix)}</p>}<button disabled={pending || !chosen || balance < Number(chosen?.prix ?? 0)} className={button + ' !bg-rose-800'}>Vérifier l’achat MEDEVAC</button></form>}
  {selected && <section role="dialog" aria-modal="true" aria-label="Gestion de l’appareil" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"><div className="max-h-[85dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-6"><h2 className="text-xl font-bold text-white">Gérer {selected.immatriculation}</h2><form onSubmit={e => { e.preventDefault(); void send(`/api/siavi/avions/${selected.id}`, 'PATCH', { action: 'rename', name }); }} className="space-y-3"><label className="block text-sm text-slate-300">Nom de l’appareil<input className={field + ' mt-2'} maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><button className={button} disabled={pending}>Enregistrer le nom</button></form><div className="space-y-3 border-t border-slate-700 pt-4"><h3 className="font-semibold text-white">Disponibilité et entretien</h3>{selected.statut === 'ground' && <button className={button} disabled={pending} onClick={() => void send(`/api/siavi/avions/${selected.id}`, 'PATCH', { action: 'maintenance' })}>Immobiliser pour entretien</button>}{selected.statut === 'maintenance' && !selected.maintenance_fin_at && Number(selected.usure_percent) > 0 && <button className={button} disabled={pending} onClick={() => void send(`/api/siavi/avions/${selected.id}`, 'PATCH', { action: 'release' })}>Remettre en service</button>}{['ground', 'bloque', 'maintenance'].includes(selected.statut) && !selected.maintenance_fin_at && Number(selected.usure_percent) < 100 && <><p className="text-sm text-slate-300">Réparation à 100 % dans une base MEDEVAC : {money(Math.round(Number(selected.types_avion?.prix ?? 0) * 0.5))}, même tarif que les compagnies.</p><button className={button} disabled={pending || !hubs.some(h => h.aeroport_oaci === selected.aeroport_actuel)} onClick={() => setConfirmation({ url: `/api/siavi/avions/${selected.id}`, method: 'PATCH', body: { action: 'repair' }, label: `Réparer ${selected.immatriculation} pour ${money(Math.round(Number(selected.types_avion?.prix ?? 0) * 0.5))}` })}>Vérifier la réparation</button>{!hubs.some(h => h.aeroport_oaci === selected.aeroport_actuel) && <p className="text-sm text-amber-200">L’appareil doit rejoindre une base MEDEVAC.</p>}</>}</div><button className={button + ' w-full'} disabled={pending} onClick={() => setSelected(null)}>Fermer</button></div></section>}
  {confirmation && <section role="dialog" aria-modal="true" aria-label="Confirmer l’opération" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-lg space-y-5 rounded-2xl border border-rose-500/50 bg-slate-900 p-6"><h2 className="text-xl font-bold text-white">Confirmer l’opération</h2><p className="text-slate-200">{confirmation.label} ?</p><p className="text-sm text-slate-400">Les dépenses sont prélevées sur le compte SIAVI.</p>{message && <p role="status" className="text-amber-200">{message}</p>}<div className="flex flex-wrap gap-3"><button disabled={pending} className={button + ' !bg-rose-800'} onClick={() => void send(confirmation.url, confirmation.method, confirmation.body)}>{pending ? 'Enregistrement…' : 'Confirmer'}</button><button disabled={pending} className={button} onClick={() => setConfirmation(null)}>Retour</button></div></div></section>}
 </div>;
}
