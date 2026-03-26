import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EditVolMilitaireClient from './EditVolMilitaireClient';

export default async function ModifierVolMilitairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, role').eq('id', user.id).single();
  if (!profile?.armee && profile?.role !== 'admin') redirect('/militaire');

  const admin = createAdminClient();
  const { data: vol } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc,
      statut, type_vol, armee_avion_id, callsign, commandant_bord,
      escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre,
      aeroport_depart, aeroport_arrivee, mission_id, role_pilote
    `)
    .eq('id', id)
    .eq('type_vol', 'Vol militaire')
    .single();

  if (!vol) notFound();
  if (vol.statut !== 'en_attente' && profile?.role !== 'admin') redirect(`/militaire/vol/${id}`);

  const canEdit = vol.pilote_id === user.id || vol.copilote_id === user.id || vol.chef_escadron_id === user.id || profile?.role === 'admin';
  if (!canEdit) redirect(`/militaire/vol/${id}`);

  const { data: equipage } = await admin
    .from('vols_equipage_militaire')
    .select('profile_id')
    .eq('vol_id', id);

  const { data: pilotesArmee } = await supabase
    .from('profiles')
    .select('id, identifiant')
    .eq('armee', true)
    .order('identifiant');

  const list = (pilotesArmee || []).filter((p) => p.id !== user.id);

  const { data: inventaireMilitaire } = await admin.from('armee_avions')
    .select('id, nom_personnalise, types_avion(id, nom, code_oaci)')
    .order('created_at', { ascending: false });

  const volData = {
    ...vol,
    equipage_ids: (equipage || []).map(e => e.profile_id),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/militaire/vol/${id}`} className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Modifier le vol militaire</h1>
      </div>
      <EditVolMilitaireClient
        vol={volData}
        pilotesArmee={list}
        inventaireMilitaire={inventaireMilitaire || []}
      />
    </div>
  );
}
