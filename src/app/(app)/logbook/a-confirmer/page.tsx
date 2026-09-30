import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDateMediumUTC } from '@/lib/date-utils';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import PlanVolCopiloteActions from '../plans-vol/PlanVolCopiloteActions';

export default async function LogbookAConfirmerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: volsPilote }, { data: volsCopilote }, { data: volsInstructeur }, { data: plansCopilote }] = await Promise.all([
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote').order('depart_utc', { ascending: false }),
    admin.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('instructeur_id', user.id).eq('statut', 'en_attente_confirmation_instructeur').order('depart_utc', { ascending: false }),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, temps_prev_min, created_at, pilote:profiles!plans_vol_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_copilote').order('created_at', { ascending: false }),
  ]);

  const hasAny = (volsPilote?.length ?? 0) > 0 || (volsCopilote?.length ?? 0) > 0 || (volsInstructeur?.length ?? 0) > 0 || (plansCopilote?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Vols à confirmer</h1>
      </div>

      <p className="text-slate-400 text-sm">
        Un co-pilote ou un pilote vous a indiqué sur ces vols, un pilote a saisi un vol d&apos;instruction avec vous comme instructeur, ou un plan de vol attend votre validation copilote. Ouvrez chacun, vérifiez, puis confirmez.
      </p>

      {!hasAny && (
        <div className="card">
          <p className="text-slate-500">Aucun vol en attente de votre confirmation.</p>
        </div>
      )}

      {volsPilote && volsPilote.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Un co-pilote vous a indiqué comme pilote</h2>
          <ul className="divide-y divide-slate-700/50">
            {volsPilote.map((v) => {
              const identifiantCopilote = (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—';
              return (
                <li key={v.id}>
                  <Link href={`/logbook/vol/${v.id}?from=confirmer`} className="flex items-center justify-between py-4 text-left hover:bg-slate-800/30 -mx-4 px-4 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium text-slate-200">{formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
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
        <div className="card border-violet-500/30">
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
        <div className="card">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Un pilote vous a indiqué comme co-pilote</h2>
          <ul className="divide-y divide-slate-700/50">
            {volsCopilote.map((v) => {
              const identifiantPilote = (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—';
              return (
                <li key={v.id}>
                  <Link href={`/logbook/vol/${v.id}?from=confirmer`} className="flex items-center justify-between py-4 text-left hover:bg-slate-800/30 -mx-4 px-4 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium text-slate-200">{formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
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
        <div className="card border-sky-500/30">
          <h2 className="text-lg font-medium text-slate-200 mb-2">Vols d&apos;instruction à valider</h2>
          <p className="text-sm text-slate-500 mb-3">Un pilote a saisi ces vols avec vous comme instructeur. Validez ou refusez ; le vol ne passe pas par la file des admins.</p>
          <ul className="divide-y divide-slate-700/50">
            {volsInstructeur.map((v) => {
              const identifiantPilote = (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—';
              return (
                <li key={v.id}>
                  <Link href={`/logbook/vol/${v.id}?from=confirmer`} className="flex items-center justify-between py-4 text-left hover:bg-slate-800/30 -mx-4 px-4 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium text-slate-200">{formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
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
