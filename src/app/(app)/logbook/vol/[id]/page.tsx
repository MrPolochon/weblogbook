import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolEditForm from './VolEditForm';

export default async function LogbookVolEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: vol } = await supabase
    .from('vols')
    .select(`
      id, pilote_id, type_avion_id, compagnie_id, compagnie_libelle, duree_minutes, depart_utc,
      type_vol, commandant_bord, role_pilote, statut, refusal_count, refusal_reason
    `)
    .eq('id', id)
    .single();

  if (!vol) notFound();
  if (vol.pilote_id !== user.id) redirect('/logbook');
  if (vol.statut === 'validé') redirect('/logbook');
  if (vol.statut === 'refusé' && (vol.refusal_count ?? 0) >= 3) redirect('/logbook');

  const [{ data: types }, { data: compagnies }] = await Promise.all([
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
    supabase.from('compagnies').select('id, nom').order('nom'),
  ]);

  const departLocal = vol.depart_utc ? new Date(vol.depart_utc).toISOString().slice(0, 16) : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
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
        dureeMinutes={vol.duree_minutes}
        departUtc={departLocal}
        typeVol={vol.type_vol as 'IFR' | 'VFR'}
        commandantBord={vol.commandant_bord}
        rolePilote={vol.role_pilote as 'Pilote' | 'Co-pilote'}
        typesAvion={types || []}
        compagnies={compagnies || []}
      />
    </div>
  );
}
