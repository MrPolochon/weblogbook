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
    from === 'admin-pilote' && pid ? `/admin/pilotes/${pid}/logbook` :
    from === 'admin-compagnie' && cid ? `/admin/compagnies/${cid}/logbook` :
    '/logbook';

  const admin = createAdminClient();
  const { data: vol } = await (isAdmin ? admin : supabase)
    .from('vols')
    .select(`
      id, pilote_id, type_avion_id, compagnie_id, compagnie_libelle, duree_minutes, depart_utc,
      type_vol, aeroport_depart, aeroport_arrivee, instructeur_id, instruction_type, commandant_bord, role_pilote, statut, refusal_count, refusal_reason
    `)
    .eq('id', id)
    .single();

  if (!vol) notFound();
  if (vol.pilote_id !== user.id && !isAdmin) redirect('/logbook');
  if (vol.statut === 'validé' && !isAdmin) redirect('/logbook');
  if (vol.statut === 'refusé' && (vol.refusal_count ?? 0) >= 3 && !isAdmin) redirect('/logbook');

  const client = isAdmin ? admin : supabase;
  const [{ data: types }, { data: compagnies }, { data: admins }] = await Promise.all([
    client.from('types_avion').select('id, nom, constructeur').order('ordre'),
    client.from('compagnies').select('id, nom').order('nom'),
    client.from('profiles').select('id, identifiant').eq('role', 'admin').order('identifiant'),
  ]);

  const departLocal = vol.depart_utc ? new Date(vol.depart_utc).toISOString().slice(0, 16) : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backHref} className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">
          {vol.statut === 'refusé' ? 'Modifier et renvoyer' : 'Modifier le vol'}
        </h1>
      </div>
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
        typesAvion={types || []}
        compagnies={compagnies || []}
        admins={admins || []}
        successRedirect={backHref}
      />
    </div>
  );
}
