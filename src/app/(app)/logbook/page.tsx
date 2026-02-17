import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { formatDuree, cn } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { Plus, BookOpen, Plane, FileText, Clock, CheckCircle2, XCircle, Timer, TrendingUp, Calendar, MapPin, ArrowRight } from 'lucide-react';
import VolDeleteButton from '@/components/VolDeleteButton';
import NePasEnregistrerPlanButton from './NePasEnregistrerPlanButton';

export default async function LogbookPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('heures_initiales_minutes, blocked_until, role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  const blocked = profile?.blocked_until
    ? new Date(profile.blocked_until) > new Date()
    : false;

  const admin = createAdminClient();
  const [{ data: vols }, { data: volsEnAttentePilote }, { data: volsEnAttenteCopilote }, { data: volsRefuseParCopilote }, { data: volsEnAttenteInstructeur }, { data: plansVolRefuses }, { data: plansVolClotures }] = await Promise.all([
    admin.from('vols').select(`
      id, pilote_id, copilote_id, instructeur_id, duree_minutes, depart_utc, arrivee_utc, statut, compagnie_libelle, type_vol, role_pilote, callsign,
      aeroport_depart, aeroport_arrivee, instruction_type,
      refusal_count, refusal_reason,
      type_avion:types_avion(nom, constructeur),
      instructeur:profiles!vols_instructeur_id_fkey(identifiant),
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(id,identifiant)
    `).or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id},instructeur_id.eq.${user.id}`).neq('type_vol', 'Vol militaire').in('statut', ['en_attente', 'validé', 'refusé']).order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'refuse_par_copilote').order('depart_utc', { ascending: false }),
    admin.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, instructeur:profiles!vols_instructeur_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_instructeur').order('depart_utc', { ascending: false }),
    admin.from('plans_vol').select('id').eq('pilote_id', user.id).eq('statut', 'refuse'),
    admin.from('plans_vol').select('id, numero_vol').eq('pilote_id', user.id).eq('statut', 'cloture').not('accepted_at', 'is', null).not('cloture_at', 'is', null),
  ]);

  const totalValides = (vols || []).filter((v) => v.statut === 'validé');
  const volsEnAttente = (vols || []).filter((v) => v.statut === 'en_attente');
  const volsRefuses = (vols || []).filter((v) => v.statut === 'refusé');
  const totalMinutes =
    (profile?.heures_initiales_minutes ?? 0) +
    totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

  // Calculs statistiques
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <div className="space-y-6">
      {/* Header avec gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-white/10 backdrop-blur">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Mon Logbook</h1>
            </div>
            <p className="text-sky-100/80 text-sm">Gérez vos vols et suivez votre progression</p>
          </div>
          {!blocked && (
            <div className="flex flex-wrap gap-2">
              <Link 
                href="/logbook/plans-vol" 
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white text-sm font-medium transition-all"
              >
                <FileText className="h-4 w-4" />
                Plans de vol
                {(plansVolRefuses?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold">
                    {plansVolRefuses!.length}
                  </span>
                )}
              </Link>
              <Link 
                href="/logbook/depot-plan-vol" 
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white text-sm font-medium transition-all"
              >
                <Plane className="h-4 w-4" />
                Déposer un plan
              </Link>
              <Link 
                href="/logbook/nouveau" 
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-sky-50 text-sky-700 text-sm font-bold transition-all shadow-lg"
              >
                <Plus className="h-4 w-4" />
                Nouveau vol
              </Link>
            </div>
          )}
          {blocked && (
            <div className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-sm">
              Vous ne pouvez pas ajouter de vol pour le moment.
            </div>
          )}
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-5 transition-all hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-emerald-400/80 text-sm font-medium">Temps de vol total</p>
              <p className="text-3xl font-bold text-emerald-400 mt-1">
                {heures}<span className="text-lg">h</span>{minutes.toString().padStart(2, '0')}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
              <Clock className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-emerald-500/10">
            <p className="text-xs text-slate-500">{formatDuree(totalMinutes)}</p>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-600/5 border border-sky-500/20 p-5 transition-all hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sky-400/80 text-sm font-medium">Vols validés</p>
              <p className="text-3xl font-bold text-sky-400 mt-1">{totalValides.length}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-500/10 group-hover:bg-sky-500/20 transition-colors">
              <CheckCircle2 className="h-5 w-5 text-sky-400" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-sky-500/10">
            <p className="text-xs text-slate-500">Vols comptabilisés dans le logbook</p>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-5 transition-all hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-amber-400/80 text-sm font-medium">En attente</p>
              <p className="text-3xl font-bold text-amber-400 mt-1">{volsEnAttente.length}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
              <Timer className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-amber-500/10">
            <p className="text-xs text-slate-500">En attente de validation</p>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-5 transition-all hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-purple-400/80 text-sm font-medium">Total vols</p>
              <p className="text-3xl font-bold text-purple-400 mt-1">{vols?.length || 0}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-purple-500/10">
            <p className="text-xs text-slate-500">Tous statuts confondus</p>
          </div>
        </div>
      </div>

      {/* Alertes importantes */}
      {plansVolRefuses && plansVolRefuses.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border-2 border-red-500/40 bg-gradient-to-r from-red-500/10 to-red-600/5 p-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative flex items-start gap-4">
            <div className="p-3 rounded-xl bg-red-500/20 shrink-0">
              <XCircle className="h-6 w-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-red-200 mb-1">Plan(s) de vol refusé(s) par l&apos;ATC</h2>
              <p className="text-sm text-slate-400 mb-4">L&apos;ATC a refusé {plansVolRefuses.length} plan(s) de vol. Modifiez-les selon les indications et renvoyez-les.</p>
              <Link href="/logbook/plans-vol" className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-medium text-white transition-colors shadow-lg shadow-red-500/20">
                <FileText className="h-4 w-4" />
                Voir et modifier les plans refusés
              </Link>
            </div>
          </div>
        </div>
      )}

      {plansVolClotures && plansVolClotures.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 p-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative flex items-start gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-emerald-200 mb-1">Plan(s) de vol clôturé(s) à enregistrer</h2>
              <p className="text-sm text-slate-400 mb-4">
                {plansVolClotures.length} plan{plansVolClotures.length > 1 ? 's' : ''} clôturé{plansVolClotures.length > 1 ? 's' : ''}. Cliquez sur « Nouveau vol » pour remplir le formulaire automatiquement.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/logbook/nouveau?plan=${plansVolClotures[0].id}`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors shadow-lg shadow-emerald-500/20">
                  <Plus className="h-4 w-4" />
                  Nouveau vol (remplissage automatique)
                </Link>
                <NePasEnregistrerPlanButton planId={plansVolClotures[0].id} />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                « Ne pas enregistrer ce vol » supprime définitivement le plan de vol sans créer de vol.
              </p>
            </div>
          </div>
        </div>
      )}

      {volsEnAttentePilote && volsEnAttentePilote.length > 0 && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <h2 className="text-lg font-medium text-amber-200 mb-2">En attente que le pilote confirme</h2>
          <p className="text-sm text-slate-400 mb-3">Vous avez indiqué ces vols comme co-pilote. Ils n’apparaîtront dans les logbooks qu’après confirmation du pilote.</p>
          <ul className="space-y-2">
            {volsEnAttentePilote.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Pilote: '}{(Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                  <VolDeleteButton volId={v.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {volsEnAttenteCopilote && volsEnAttenteCopilote.length > 0 && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <h2 className="text-lg font-medium text-amber-200 mb-2">En attente que le co-pilote confirme</h2>
          <p className="text-sm text-slate-400 mb-3">Vous avez indiqué ces vols avec un co-pilote. Ils n&apos;apparaîtront dans les logbooks qu&apos;après confirmation du co-pilote.</p>
          <ul className="space-y-2">
            {volsEnAttenteCopilote.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Co-pilote: '}{(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                  <VolDeleteButton volId={v.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {volsEnAttenteInstructeur && volsEnAttenteInstructeur.length > 0 && (
        <div className="card border-sky-500/30 bg-sky-500/5">
          <h2 className="text-lg font-medium text-sky-200 mb-2">En attente que l&apos;instructeur confirme</h2>
          <p className="text-sm text-slate-400 mb-3">Vols d&apos;instruction. L&apos;instructeur indiqué validera directement — le vol ne passe pas par la file des admins. Seul l&apos;instructeur peut supprimer.</p>
          <ul className="space-y-2">
            {volsEnAttenteInstructeur.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Instructeur: '}{(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {volsRefuseParCopilote && volsRefuseParCopilote.length > 0 && (
        <div className="card border-red-500/30 bg-red-500/5">
          <h2 className="text-lg font-medium text-red-200 mb-2">Le co-pilote a refusé de confirmer</h2>
          <p className="text-sm text-slate-400 mb-3">Le co-pilote indiqué a refusé d&apos;être associé à ces vols. Modifiez le co-pilote ou retirez-le pour renvoyer le vol.</p>
          <ul className="space-y-2">
            {volsRefuseParCopilote.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {formatDateMediumUTC(v.depart_utc)} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Co-pilote indiqué: '}{(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                  <VolDeleteButton volId={v.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200">Vols</h2>
          {vols && vols.length > 0 && (
            <span className="text-xs text-slate-500">{vols.length} vol{vols.length > 1 ? 's' : ''}</span>
          )}
        </div>
        {!vols || vols.length === 0 ? (
          <div className="text-center py-12">
            <Plane className="h-12 w-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500">Aucun vol enregistre.</p>
            <Link href="/logbook/nouveau" className="text-sky-400 text-sm hover:underline mt-2 inline-block">
              Enregistrer votre premier vol
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600/50">
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Route</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Appareil</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Cie / Callsign</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Duree</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Type / Role</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Statut</th>
                  <th className="pb-3 w-10"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {vols.map((v) => (
                  <tr key={v.id} className="group hover:bg-slate-700/20 transition-colors">
                    <td className="py-3 pr-4">
                      {(v.statut === 'refusé' && (v.refusal_count ?? 0) < 3) || v.statut === 'en_attente' ? (
                        <Link href={`/logbook/vol/${v.id}`} className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
                          {formatDateMediumUTC(v.depart_utc)}
                        </Link>
                      ) : (
                        <span className="text-slate-300">{formatDateMediumUTC(v.depart_utc)}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <span className="font-mono text-xs bg-slate-700/50 px-1.5 py-0.5 rounded">{v.aeroport_depart || '—'}</span>
                        <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                        <span className="font-mono text-xs bg-slate-700/50 px-1.5 py-0.5 rounded">{v.aeroport_arrivee || '—'}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatTimeUTC(v.depart_utc)} — {v.arrivee_utc ? formatTimeUTC(v.arrivee_utc) : '—'}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-300 text-xs">
                      {(() => {
                        const ta = Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion;
                        return (
                          <>
                            {(ta as { nom?: string })?.nom || '—'}
                            {(ta as { constructeur?: string })?.constructeur && (
                              <span className="block text-slate-500 text-xs">{(ta as { constructeur?: string }).constructeur}</span>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-slate-300 text-xs">{v.compagnie_libelle || '—'}</span>
                      {v.callsign && <span className="block text-xs text-sky-400/70 font-mono">{v.callsign}</span>}
                    </td>
                    <td className="py-3 pr-4 text-slate-300 font-mono text-xs">{formatDuree(v.duree_minutes || 0)}</td>
                    <td className="py-3 pr-4">
                      <span className="text-slate-300 text-xs">{v.type_vol}</span>
                      <span className="block text-xs text-slate-500">
                        {v.instructeur_id === user.id ? 'Instructeur' : (v.copilote_id === user.id || (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.id === user.id) ? 'Co-pilote' : v.role_pilote}
                      </span>
                      {v.type_vol === 'Instruction' && (v.instructeur || v.instruction_type) && (
                        <span className="block text-xs text-slate-600 mt-0.5">
                          {(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? ''}
                          {v.instruction_type ? ` · ${v.instruction_type}` : ''}
                        </span>
                      )}
                      {v.copilote_id && (() => {
                        const estPilote = v.pilote_id === user.id;
                        const autre = estPilote ? (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote) : (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote);
                        return (
                          <span className="block text-xs text-slate-600 mt-0.5">
                            {estPilote ? 'Co: ' : 'PIC: '}{autre?.identifiant ?? '—'}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          v.statut === 'validé'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                            : v.statut === 'refusé'
                              ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                        )}
                      >
                        {v.statut === 'validé' ? <CheckCircle2 className="h-3 w-3" /> : v.statut === 'refusé' ? <XCircle className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
                        {v.statut === 'validé' ? 'Valide' : v.statut === 'refusé' ? 'Refuse' : 'Attente'}
                      </span>
                    </td>
                    <td className="py-3">
                      <VolDeleteButton
                        volId={v.id}
                        canDelete={isAdmin || (v.type_vol === 'Instruction' && v.instructeur_id ? v.instructeur_id === user.id : (v.pilote_id === user.id || v.copilote_id === user.id))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
