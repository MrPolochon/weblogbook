import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolEditForm from './VolEditForm';

export default async function LogbookVolEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
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
  const { data: vol } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, copilote_confirme_par_pilote, type_avion_id, compagnie_id, compagnie_libelle, duree_minutes, depart_utc,
      type_vol, aeroport_depart, aeroport_arrivee, instructeur_id, instruction_type, commandant_bord, role_pilote, statut, refusal_count, refusal_reason,
      copilote:profiles!vols_copilote_id_fkey(identifiant)
    `)
    .eq('id', id)
    .single();

  if (!vol) notFound();
  const isPiloteOrCopilote = vol.pilote_id === user.id || vol.copilote_id === user.id;
  const isInstructeurEnAttente = vol.instructeur_id === user.id && vol.statut === 'en_attente_confirmation_instructeur';
  if (!isPiloteOrCopilote && !isAdmin && !isInstructeurEnAttente) redirect('/logbook');
  if (vol.statut === 'validé' && !isAdmin) redirect('/logbook');
  if (vol.statut === 'refusé' && (vol.refusal_count ?? 0) >= 3 && !isAdmin) redirect('/logbook');

  const client = isAdmin ? admin : supabase;
  const [{ data: types }, { data: compagnies }, { data: admins }, { data: allProfiles }] = await Promise.all([
    client.from('types_avion').select('id, nom, constructeur').order('ordre'),
    client.from('compagnies').select('id, nom').order('nom'),
    client.from('profiles').select('id, identifiant').eq('role', 'admin').order('identifiant'),
    client.from('profiles').select('id, identifiant').order('identifiant'),
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
      <div className="flex items-center gap-4">
        <Link href={backHref} className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">
          {isConfirmationInstructeur
            ? 'Valider le vol d\'instruction'
            : isConfirmationMode
              ? 'Confirmer et envoyer aux admins'
              : vol.statut === 'refusé'
                ? 'Modifier et renvoyer'
                : 'Modifier le vol'}
        </h1>
      </div>
      {isConfirmationInstructeur && (
        <div className="card border-sky-500/30 bg-sky-500/5">
          <p className="text-sm text-slate-300">
            Un pilote a saisi ce vol d&apos;instruction avec vous comme instructeur. Vous ne pouvez pas modifier les champs. Validez le vol (il sera comptabilisé dans votre logbook et celui du pilote) ou refusez-le avec une raison.
          </p>
        </div>
      )}
      {isConfirmationMode && !isConfirmationInstructeur && (
        <div className="card border-sky-500/30 bg-sky-500/5">
          <p className="text-sm text-slate-300">
            {isConfirmationPilote
              ? 'Un co-pilote vous a indiqué comme pilote pour ce vol. Vérifiez ou corrigez les informations ci‑dessous, puis cliquez sur « Confirmer et envoyer aux admins ». Le vol sera ensuite soumis aux admins et apparaîtra dans les deux logbooks.'
              : 'Un pilote vous a indiqué comme co-pilote pour ce vol. Vous ne pouvez pas modifier les champs ci‑dessous. Soit vous confirmez qu\'il s\'agit bien de votre vol (« Confirmer et envoyer aux admins »), soit vous indiquez que ce n\'est pas vous (« Ce n\'est pas moi le co-pilote ») : le vol sera renvoyé au pilote.'}
          </p>
        </div>
      )}
      {isRefuseParCopilote && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-amber-200">
            <strong>{identifiantCopilote}</strong> a refusé de confirmer qu&apos;il était votre co-pilote. Modifiez le co-pilote ou retirez-le ci‑dessous, puis enregistrez.
          </p>
        </div>
      )}
      {vol.statut === 'refusé' && vol.refusal_reason && (
        <div className="card border-amber-500/30 bg-amber-500/5">
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
        isCurrentUserPilote={vol.pilote_id === user.id}
        piloteId={vol.pilote_id ?? ''}
        copiloteId={vol.copilote_id ?? ''}
        typesAvion={types || []}
        compagnies={compagnies || []}
        admins={admins || []}
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
