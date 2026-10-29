import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { ChevronRight } from 'lucide-react';
import RecordPageHeader from '@/components/logbook/RecordPageHeader';
import PlanVolCopiloteActions from '../plans-vol/PlanVolCopiloteActions';

export default async function LogbookAConfirmerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: volsPilote, error: piloteError }, { data: volsCopilote, error: copiloteError }, { data: volsInstructeur, error: instructeurError }, { data: plansCopilote, error: plansError }] = await Promise.all([
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote').order('depart_utc', { ascending: false }),
    admin.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('instructeur_id', user.id).eq('statut', 'en_attente_confirmation_instructeur').order('depart_utc', { ascending: false }),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, temps_prev_min, created_at, pilote:profiles!plans_vol_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_copilote').order('created_at', { ascending: false }),
  ]);

  const loadError = Boolean(piloteError || copiloteError || instructeurError || plansError);
  const hasAny = (volsPilote?.length ?? 0) > 0 || (volsCopilote?.length ?? 0) > 0 || (volsInstructeur?.length ?? 0) > 0 || (plansCopilote?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <RecordPageHeader title="Confirmations d’équipage" description="Vérifiez les vols qui vous concernent. La confirmation d’équipage et la validation administrative sont deux étapes distinctes."/>
      {loadError && <p role="alert" className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-4 text-sm text-amber-200">Certaines demandes n’ont pas pu être chargées. Les listes disponibles restent affichées. <Link href="/logbook/a-confirmer" className="underline">Réessayer</Link></p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        {label:'Pilote',count:piloteError?null:volsPilote?.length??0},
        {label:'Copilote',count:copiloteError?null:volsCopilote?.length??0},
        {label:'Instruction',count:instructeurError?null:volsInstructeur?.length??0},
        {label:'Plans de vol',count:plansError?null:plansCopilote?.length??0},
      ].map(item=><div key={item.label} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3"><p className="text-xs text-slate-400">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{item.count??'—'}</p></div>)}</div>

      {!hasAny && !loadError && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <p className="text-slate-500">Aucune confirmation à traiter. Les vols déjà validés restent consultables dans le carnet.</p>
        </div>
      )}

      {volsPilote && volsPilote.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Un co-pilote vous a indiqué comme pilote</h2>
          <ul className="divide-y divide-slate-700/50">
            {volsPilote.map((v) => {
              const identifiantCopilote = (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—';
              return (
                <li key={v.id}>
                  <Link href={`/logbook/vol/${v.id}?from=confirmer`} className="flex items-center justify-between py-4 text-left hover:bg-slate-800/30 -mx-4 px-4 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium text-slate-200">{formatDateMediumUTC(v.depart_utc)} · {formatTimeUTC(v.depart_utc)} UTC — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
                      <p className="text-sm text-slate-500">{identifiantCopilote} vous a indiqué comme pilote · {v.duree_minutes} min</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-500 flex-shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {plansCopilote && plansCopilote.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Plans de vol à valider comme copilote</h2>
          <p className="text-sm text-slate-500 mb-3">Après validation, le plan est envoyé à l&apos;ATC ou confirmé sans ATC.</p>
          <ul className="divide-y divide-slate-700/50">
            {plansCopilote.map((p) => {
              const identifiantPilote = (Array.isArray(p.pilote) ? p.pilote[0] : p.pilote)?.identifiant ?? '—';
              return (
                <li key={p.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-200">{p.numero_vol} — {p.aeroport_depart || '—'} → {p.aeroport_arrivee || '—'}</p>
                    <p className="text-sm text-slate-500">{identifiantPilote} vous a désigné copilote · {p.temps_prev_min} min</p>
                  </div>
                  <PlanVolCopiloteActions planId={p.id} statut="en_attente_copilote" isCopilote />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {volsCopilote && volsCopilote.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Un pilote vous a indiqué comme co-pilote</h2>
          <ul className="divide-y divide-slate-700/50">
            {volsCopilote.map((v) => {
              const identifiantPilote = (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—';
              return (
                <li key={v.id}>
                  <Link href={`/logbook/vol/${v.id}?from=confirmer`} className="flex items-center justify-between py-4 text-left hover:bg-slate-800/30 -mx-4 px-4 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium text-slate-200">{formatDateMediumUTC(v.depart_utc)} · {formatTimeUTC(v.depart_utc)} UTC — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
                      <p className="text-sm text-slate-500">{identifiantPilote} vous a indiqué comme co-pilote · {v.duree_minutes} min</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-500 flex-shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {volsInstructeur && volsInstructeur.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Vols d&apos;instruction à valider</h2>
          <p className="text-sm text-slate-500 mb-3">Un pilote a saisi ces vols avec vous comme instructeur. Validez ou refusez ; votre décision termine cette étape de validation.</p>
          <ul className="divide-y divide-slate-700/50">
            {volsInstructeur.map((v) => {
              const identifiantPilote = (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—';
              return (
                <li key={v.id}>
                  <Link href={`/logbook/vol/${v.id}?from=confirmer`} className="flex items-center justify-between py-4 text-left hover:bg-slate-800/30 -mx-4 px-4 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium text-slate-200">{formatDateMediumUTC(v.depart_utc)} · {formatTimeUTC(v.depart_utc)} UTC — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
                      <p className="text-sm text-slate-500">{identifiantPilote} · Instruction · {v.duree_minutes} min</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-500 flex-shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
