import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { canAccessEspaceMilitaire, isBlocked } from '@/lib/armee';
import MilitaireClient from './MilitaireClient';
import type { MilitaireStats, VolMilitaireRow } from './types';

const SELECT_VOLS = `
  id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc, statut,
  type_avion_militaire, role_pilote, callsign, escadrille_ou_escadron, nature_vol_militaire,
  nature_vol_militaire_autre, aeroport_depart, aeroport_arrivee, mission_id, mission_status,
  mission_reward_final,
  pilote:profiles!vols_pilote_id_fkey(identifiant),
  copilote:profiles!vols_copilote_id_fkey(identifiant),
  equipage:vols_equipage_militaire(profile_id)
`;

export default async function MilitairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('armee, role, identifiant, blocked_until')
    .eq('id', user.id)
    .single();

  if (!canAccessEspaceMilitaire(profile)) redirect('/logbook');

  const admin = createAdminClient();
  const userBlocked = isBlocked(profile);

  const [
    { data: vols1 },
    { data: eqData },
    { count: flotteActive },
    { data: compteMilitaire },
  ] = await Promise.all([
    admin.from('vols')
      .select(SELECT_VOLS)
      .eq('type_vol', 'Vol militaire')
      .or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id},chef_escadron_id.eq.${user.id}`)
      .in('statut', ['en_attente', 'validé', 'refusé'])
      .order('depart_utc', { ascending: false }),
    admin.from('vols_equipage_militaire').select('vol_id').eq('profile_id', user.id),
    admin.from('armee_avions').select('*', { count: 'exact', head: true }).eq('detruit', false),
    admin.from('felitz_comptes').select('proprietaire_id').eq('type', 'militaire').maybeSingle(),
  ]);

  const volIdsEq = Array.from(new Set((eqData || []).map((r) => r.vol_id)));
  let vols2: typeof vols1 = [];
  if (volIdsEq.length > 0) {
    const { data } = await admin.from('vols')
      .select(SELECT_VOLS)
      .eq('type_vol', 'Vol militaire')
      .in('id', volIdsEq)
      .in('statut', ['en_attente', 'validé', 'refusé'])
      .order('depart_utc', { ascending: false });
    vols2 = data || [];
  }

  const byId = new Map((vols1 || []).map((v) => [v.id, v]));
  for (const v of vols2) {
    if (!byId.has(v.id)) byId.set(v.id, v);
  }
  const vols = Array.from(byId.values()).sort(
    (a, b) => new Date(b.depart_utc).getTime() - new Date(a.depart_utc).getTime(),
  ) as VolMilitaireRow[];

  const stats: MilitaireStats = {
    totalMinutesValides: vols.filter((v) => v.statut === 'validé').reduce((s, v) => s + (v.duree_minutes || 0), 0),
    volsEnAttente: vols.filter((v) => v.statut === 'en_attente').length,
    volsValides: vols.filter((v) => v.statut === 'validé').length,
    volsRefuses: vols.filter((v) => v.statut === 'refusé').length,
    flotteActive: flotteActive ?? 0,
  };

  const isPdgMilitaire = compteMilitaire?.proprietaire_id === user.id;

  return (
    <Suspense fallback={null}>
      <MilitaireClient
        vols={vols}
        stats={stats}
        userId={user.id}
        identifiant={profile?.identifiant || '—'}
        isPdgMilitaire={isPdgMilitaire}
        isBlocked={userBlocked}
        blockedUntil={profile?.blocked_until}
      />
    </Suspense>
  );
}
