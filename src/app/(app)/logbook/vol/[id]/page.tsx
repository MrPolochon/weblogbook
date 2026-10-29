import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlightInstructorProfilesForSelect } from '@/lib/instruction-permissions';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import RecordPageHeader from '@/components/logbook/RecordPageHeader';
import RecordFlightSummary from '@/components/logbook/RecordFlightSummary';
import { StatusBadge } from '@/components/StatusBadge';
import VolEditForm from './VolEditForm';

export default async function LogbookVolEditPage({
  params,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const from = Array.isArray(searchParams?.from) ? searchParams.from[0] : searchParams?.from;
  const pid = Array.isArray(searchParams?.pid) ? searchParams.pid[0] : searchParams?.pid;
  const cid = Array.isArray(searchParams?.cid) ? searchParams.cid[0] : searchParams?.cid;

  const backHref =
    from === 'confirmer' ? '/logbook/a-confirmer' :
    from === 'admin-pilote' && pid ? `/admin/pilotes/${pid}/logbook` :
    from === 'admin-compagnie' && cid ? `/admin/compagnies/${cid}/logbook` :
    '/logbook';

  const admin = createAdminClient();
  const { data: vol, error: volError } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, copilote_confirme_par_pilote, type_avion_id, compagnie_id, compagnie_libelle, duree_minutes, depart_utc, arrivee_utc,
      type_vol, aeroport_depart, aeroport_arrivee, instructeur_id, instruction_type, commandant_bord, role_pilote, callsign, statut, refusal_count, refusal_reason, chef_escadron_id,
      copilote:profiles!vols_copilote_id_fkey(identifiant),
      type_avion:types_avion(nom, constructeur),
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      instructeur:profiles!vols_instructeur_id_fkey(identifiant)
    `)
    .eq('id', id)
    .single();

  if (volError) return <div className="space-y-5"><RecordPageHeader title="Fiche de vol" description="Consultez les informations enregistrées dans votre carnet." backHref={backHref}/><p role="alert" className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-4 text-sm text-amber-200">La fiche ne peut pas être chargée pour le moment. <Link href={`/logbook/vol/${id}`} className="underline">Réessayer</Link></p></div>;
  if (!vol) notFound();
  if (vol.type_vol === 'Vol militaire') redirect('/militaire');

  const isPiloteOrCopilote = vol.pilote_id === user.id || vol.copilote_id === user.id;
  const isInstructeurEnAttente = vol.instructeur_id === user.id && vol.statut === 'en_attente_confirmation_instructeur';
  const isAssociatedInstructor = vol.instructeur_id === user.id;
  if (!isPiloteOrCopilote && !isAdmin && !isAssociatedInstructor) redirect('/logbook');
  const readOnlyRecord = !isAdmin && (vol.statut === 'validé' || (vol.statut === 'refusé' && (vol.refusal_count ?? 0) >= 3) || (isAssociatedInstructor && !isPiloteOrCopilote && !isInstructeurEnAttente));
  if (readOnlyRecord) {
    const aircraft = Array.isArray(vol.type_avion) ? vol.type_avion[0] : vol.type_avion;
    const pilot = Array.isArray(vol.pilote) ? vol.pilote[0] : vol.pilote;
    const copilot = Array.isArray(vol.copilote) ? vol.copilote[0] : vol.copilote;
    const instructor = Array.isArray(vol.instructeur) ? vol.instructeur[0] : vol.instructeur;
    return <div className="space-y-5">
      <RecordPageHeader title="Fiche de vol" description="Les informations conservées dans votre carnet. Cette fiche est consultable en lecture seule." backHref={backHref}/>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-100">Compte rendu du vol</h2><StatusBadge status={vol.statut} map={{'validé':{label:'Validé',className:'border border-emerald-700/60 bg-emerald-950/20 text-emerald-300'},'refusé':{label:'Refusé',className:'border border-red-800/60 bg-red-950/20 text-red-300'},'en_attente':{label:'À valider',className:'border border-amber-700/60 bg-amber-950/20 text-amber-300'}}}/></div>
        <RecordFlightSummary departure={vol.aeroport_depart ?? ''} arrival={vol.aeroport_arrivee ?? ''} departureUtc={vol.depart_utc ?? ''} durationMinutes={vol.duree_minutes} aircraft={aircraft?.nom ?? ''} company={vol.compagnie_libelle ?? ''} callsign={vol.callsign ?? ''} role={isAssociatedInstructor ? 'Instructeur' : vol.copilote_id === user.id ? 'Co-pilote' : vol.role_pilote}/>
        <dl className="mt-5 grid gap-4 border-t border-slate-700 pt-5 sm:grid-cols-2 lg:grid-cols-4">{[['Régime de vol',vol.type_vol],['Commandant de bord',vol.commandant_bord || pilot?.identifiant],['Copilote',copilot?.identifiant],['Instruction',instructor ? instructor.identifiant + (vol.instruction_type ? ' · '+vol.instruction_type : '') : null]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value || '—'}</dd></div>)}</dl>
        {vol.refusal_reason && <p className="mt-5 rounded-lg border border-amber-700/60 bg-amber-950/20 p-3 text-sm text-amber-200">Motif de refus : {vol.refusal_reason}</p>}
      </section>
    </div>;
  }

  const client = isAdmin ? admin : supabase;
  const [{ data: types }, { data: compagnies }, { data: allProfiles }, instructeurs] = await Promise.all([
    client.from('types_avion').select('id, nom, constructeur').order('ordre'),
    client.from('compagnies').select('id, nom').order('nom'),
    client.from('profiles').select('id, identifiant').order('identifiant'),
    getFlightInstructorProfilesForSelect(admin),
  ]);

  const autresProfiles = (allProfiles || []).filter((p) => p.id !== user.id);
  const departLocal = vol.depart_utc ? new Date(vol.depart_utc).toISOString().slice(0, 16) : '';
  const isConfirmationPilote = vol.statut === 'en_attente_confirmation_pilote' && vol.pilote_id === user.id;
  const isConfirmationCopilote = vol.statut === 'en_attente_confirmation_copilote' && vol.copilote_id === user.id;
  const isConfirmationInstructeur = vol.statut === 'en_attente_confirmation_instructeur' && vol.instructeur_id === user.id;
  const isConfirmationMode = isConfirmationPilote || isConfirmationCopilote || isConfirmationInstructeur;
  const isRefuseParCopilote = vol.statut === 'refuse_par_copilote' && vol.pilote_id === user.id;
  const identifiantCopilote = (Array.isArray(vol.copilote) ? vol.copilote[0] : vol.copilote)?.identifiant ?? '—';

  return (
    <div className="space-y-6">
      <RecordPageHeader title={isConfirmationInstructeur ? 'Vérifier le vol d’instruction' : isConfirmationMode ? 'Confirmer votre participation' : vol.statut === 'refusé' ? 'Corriger le compte rendu' : 'Modifier le compte rendu'} description={isConfirmationMode ? 'Vérifiez la route, les horaires UTC et l’équipage avant de confirmer votre participation.' : 'Les informations corrigées seront transmises au circuit de validation du carnet.'} backHref={backHref}/>
      {isConfirmationInstructeur && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-sm text-slate-300">
            Un pilote a saisi ce vol d&apos;instruction avec vous comme instructeur. Vous ne pouvez pas modifier les champs. Validez le vol (il sera comptabilisé dans votre logbook et celui du pilote) ou refusez-le avec une raison.
          </p>
        </div>
      )}
      {isConfirmationMode && !isConfirmationInstructeur && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-sm text-slate-300">
            {isConfirmationPilote
              ? 'Un co-pilote vous a indiqué comme pilote pour ce vol. Vérifiez ou corrigez les informations ci‑dessous, puis cliquez sur « Confirmer et transmettre ». Le vol sera ensuite soumis aux admins et apparaîtra dans les deux logbooks.'
              : 'Un pilote vous a indiqué comme co-pilote pour ce vol. Vous ne pouvez pas modifier les champs ci‑dessous. Soit vous confirmez qu\'il s\'agit bien de votre vol (« Confirmer et transmettre »), soit vous indiquez que ce n\'est pas vous (« Ce n\'est pas moi le co-pilote ») : le vol sera renvoyé au pilote.'}
          </p>
        </div>
      )}
      {isRefuseParCopilote && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-200">
            <strong>{identifiantCopilote}</strong> a refusé de confirmer qu&apos;il était votre co-pilote. Modifiez le co-pilote ou retirez-le ci‑dessous, puis enregistrez.
          </p>
        </div>
      )}
      {vol.statut === 'refusé' && vol.refusal_reason && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-4">
          <p className="text-sm text-slate-400">Raison du refus :</p>
          <p className="text-amber-200">{vol.refusal_reason}</p>
        </div>
      )}
      <VolEditForm
        volId={vol.id}
        typeAvionId={vol.type_avion_id}
        compagnieId={vol.compagnie_id}
        compagnieLibelle={vol.compagnie_libelle}
        aeroportDepart={vol.aeroport_depart ?? ''}
        aeroportArrivee={vol.aeroport_arrivee ?? ''}
        dureeMinutes={vol.duree_minutes}
        departUtc={departLocal}
        typeVol={(vol.type_vol as 'IFR' | 'VFR' | 'Instruction') || 'VFR'}
        instructeurId={vol.instructeur_id ?? ''}
        instructionType={vol.instruction_type ?? ''}
        commandantBord={vol.commandant_bord}
        rolePilote={vol.role_pilote as 'Pilote' | 'Co-pilote'}
        callsign={vol.callsign || ''}
        isCurrentUserPilote={vol.pilote_id === user.id}
        piloteId={vol.pilote_id ?? ''}
        copiloteId={vol.copilote_id ?? ''}
        typesAvion={types || []}
        compagnies={compagnies || []}
        instructeurs={instructeurs || []}
        autresProfiles={autresProfiles}
        successRedirect={isConfirmationInstructeur ? '/logbook/a-confirmer' : (isRefuseParCopilote ? '/logbook' : backHref)}
        isConfirmationMode={isConfirmationMode}
        readOnly={isConfirmationCopilote || isConfirmationInstructeur}
        isRefuseParCopilote={isRefuseParCopilote}
        isConfirmationInstructeur={isConfirmationInstructeur}
      />
    </div>
  );
}
