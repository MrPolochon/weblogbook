import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { filterStudentInventory } from '@/lib/instruction-fictive-aircraft';
import { Plane, Users, Weight, CheckCircle2, Clock, Shield, Search, ArrowRight, AlertTriangle, Store } from 'lucide-react';
import Link from 'next/link';

const ACTIVE_STATUSES = ['depose', 'en_attente', 'en_attente_copilote', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause', 'planifie_suivant'];

export default async function InventairePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 80) : '';
  const selectedStatus = typeof params.etat === 'string' && ['disponible', 'engage'].includes(params.etat) ? params.etat : '';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: inventaire, error: inventoryError } = await admin.from('inventaire_avions')
    .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg, est_militaire, categorie)')
    .eq('proprietaire_id', user.id).order('created_at', { ascending: false });
  const visibleInventaire = filterStudentInventory(inventaire || []);
  // One lookup for the inventory, instead of one query per aircraft.
  const { data: activePlans, error: statusError } = visibleInventaire.length > 0
    ? await admin.from('plans_vol').select('inventaire_avion_id').in('inventaire_avion_id', visibleInventaire.map(a => a.id)).in('statut', ACTIVE_STATUSES)
    : { data: [], error: null };
  const engagedIds = new Set((activePlans || []).map(p => p.inventaire_avion_id));
  const aircraft = visibleInventaire.map(item => {
    const raw = item.types_avion;
    const type = (Array.isArray(raw) ? raw[0] : raw) as { id: string; nom: string; code_oaci: string | null; capacite_pax: number; capacite_cargo_kg: number; est_militaire: boolean; categorie: string | null } | null;
    return { ...item, type, engaged: engagedIds.has(item.id) };
  });
  const needle = search.toLocaleLowerCase('fr');
  const filtered = aircraft.filter(item => (!needle || [item.nom_personnalise, item.immatriculation, item.type?.nom, item.type?.code_oaci].some(value => value?.toLocaleLowerCase('fr').includes(needle)))
    && (!selectedStatus || !!statusError || (selectedStatus === 'engage' ? item.engaged : !item.engaged)));
  const engagedCount = aircraft.filter(item => item.engaged).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/70 pb-6">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Gestion des appareils</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Mes avions</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Retrouvez vos immatriculations, les capacités catalogue et les appareils déjà affectés à un plan de vol.</p></div>
        <Link href="/marketplace" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"><Store className="h-4 w-4" /> Catalogue des appareils</Link>
      </header>
      {inventoryError ? <div role="alert" className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-5 text-sm text-amber-100"><p className="font-semibold">Vos avions n’ont pas pu être chargés.</p><p className="mt-1">Vos appareils ne sont pas considérés comme absents. Rechargez la page pour vérifier leur situation.</p><Link href="/inventaire" className="mt-3 inline-flex min-h-10 items-center underline">Réessayer</Link></div> : <>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-slate-700/70 bg-slate-700/70 sm:grid-cols-3">
          <div className="bg-slate-900 px-5 py-4"><dt className="text-xs text-slate-400">Appareils détenus</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{aircraft.length}</dd></div>
          <div className="bg-slate-900 px-5 py-4"><dt className="flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 className="h-4 w-4" /> Sans plan actif</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{statusError ? '—' : aircraft.length - engagedCount}</dd></div>
          <div className="bg-slate-900 px-5 py-4"><dt className="flex items-center gap-2 text-xs text-slate-400"><Clock className="h-4 w-4" /> Affectés à un plan</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{statusError ? '—' : engagedCount}</dd></div>
        </dl>
        {statusError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-700/60 p-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> La disponibilité n’a pas pu être vérifiée. Consultez vos plans avant d’engager un appareil.</p>}
        <section aria-labelledby="fleet-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="fleet-title" className="text-lg font-semibold text-slate-100">Registre des appareils</h2><p className="text-xs text-slate-400">{filtered.length} appareil{filtered.length > 1 ? 's' : ''} dans cette sélection</p></div>
          <form action="/inventaire" className="grid gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
            <label className="text-xs font-medium text-slate-400">Rechercher<div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden /><input name="q" defaultValue={search} placeholder="Immatriculation, modèle, code OACI…" className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 focus:border-sky-500 focus:outline-none" /></div></label>
            <label className="text-xs font-medium text-slate-400">Affectation<select name="etat" defaultValue={selectedStatus} disabled={!!statusError} className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 disabled:opacity-50"><option value="">Tous les appareils</option><option value="disponible">Sans plan actif</option><option value="engage">Affectés à un plan</option></select></label>
            <div className="flex items-end gap-3"><button className="min-h-11 rounded-lg bg-slate-700 px-4 text-sm font-semibold text-white hover:bg-slate-600">Filtrer</button>{(search || selectedStatus) && <Link href="/inventaire" className="inline-flex min-h-11 items-center text-xs text-slate-300 underline">Effacer</Link>}</div>
          </form>
          {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center"><Plane className="mx-auto h-9 w-9 text-slate-500" /><h3 className="mt-4 font-semibold text-slate-200">{aircraft.length ? 'Aucun appareil ne correspond aux filtres' : 'Votre registre est prêt'}</h3><p className="mt-2 text-sm text-slate-400">{aircraft.length ? 'Modifiez la recherche pour retrouver vos appareils.' : 'Les appareils achetés pour votre compte personnel apparaîtront ici.'}</p><Link href={aircraft.length ? '/inventaire' : '/marketplace'} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-sky-400">{aircraft.length ? 'Afficher tous mes avions' : 'Consulter le catalogue'}<ArrowRight className="h-4 w-4" /></Link></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(item => <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-5">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-base font-semibold tracking-wide text-sky-300">{item.immatriculation || 'Immatriculation non renseignée'}</p><h3 className="mt-1 truncate text-base font-semibold text-slate-100">{item.nom_personnalise || item.type?.nom || 'Modèle non renseigné'}</h3>{item.nom_personnalise && <p className="mt-1 text-xs text-slate-400">{item.type?.nom}</p>}</div><Plane className="h-5 w-5 shrink-0 text-slate-500" /></div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="rounded border border-slate-700 px-2 py-1 font-mono">{item.type?.code_oaci || 'OACI —'}</span>{item.type?.est_militaire && <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Militaire</span>}</div>
              <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-slate-800 py-4"><div><dt className="flex items-center gap-1.5 text-xs text-slate-400"><Users className="h-3.5 w-3.5" /> Passagers</dt><dd className="mt-1 font-semibold tabular-nums text-slate-200">{Number.isFinite(item.type?.capacite_pax) ? item.type?.capacite_pax : '—'}</dd></div><div><dt className="flex items-center gap-1.5 text-xs text-slate-400"><Weight className="h-3.5 w-3.5" /> Fret catalogue</dt><dd className="mt-1 font-semibold tabular-nums text-slate-200">{item.type && Number.isFinite(item.type.capacite_cargo_kg) ? `${item.type.capacite_cargo_kg.toLocaleString('fr-FR')} kg` : '—'}</dd></div></dl>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${statusError ? 'bg-slate-800 text-slate-400' : item.engaged ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{statusError ? <AlertTriangle className="h-3.5 w-3.5" /> : item.engaged ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{statusError ? 'Situation à vérifier' : item.engaged ? 'Affecté à un plan' : 'Sans plan actif'}</span><Link href={item.engaged || statusError ? '/logbook/plans-vol' : '/logbook/depot-plan-vol'} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-sky-400">{item.engaged || statusError ? 'Voir les plans' : 'Préparer un vol'}<ArrowRight className="h-3.5 w-3.5" /></Link></div>
            </article>)}
          </div>}
          <p className="text-xs text-slate-500">Les capacités indiquées proviennent du catalogue. L’affectation à un plan ne signifie pas que l’avion a déjà décollé ; les autres conditions de départ restent vérifiées au dépôt.</p>
        </section>
      </>}
    </div>
  );
}
