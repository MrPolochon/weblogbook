export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessEspaceMilitaire, canValidateVolMilitaire, TYPE_VOL_MILITAIRE } from '@/lib/armee';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('armee, role').eq('id', user.id).single();
    if (!canAccessEspaceMilitaire(profile)) return NextResponse.json({ error: 'Accès réservé à l’Armée' }, { status: 403 });
    const admin = createAdminClient();
    const canManage = await canValidateVolMilitaire(user.id, profile);
    const page = Math.max(1, Math.min(10000, Math.floor(Number(req.nextUrl.searchParams.get('page')) || 1)));
    if (req.nextUrl.searchParams.get('mode') === 'flotte') {
      const { data, count, error } = await admin.from('armee_avions')
        .select('id, nom_personnalise, detruit, detruit_at, detruit_raison, created_at, types_avion(nom), vols:vols!vols_armee_avion_id_fkey(id, depart_utc, aeroport_depart, aeroport_arrivee, mission_titre, statut)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('depart_utc', { referencedTable: 'vols', ascending: false }).limit(1, { referencedTable: 'vols' }).range((page - 1) * 30, page * 30 - 1);
      if (error) throw error;
      return NextResponse.json({ fleet: data, count, canManage, page }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const status = req.nextUrl.searchParams.get('statut') || 'en_attente';
    if (!['tous', 'en_attente', 'validé', 'refusé'].includes(status)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    let query = admin.from('vols')
      .select('id, callsign, aeroport_depart, aeroport_arrivee, depart_utc, arrivee_utc, statut, mission_titre, mission_status, mission_reward_base, mission_reward_final, mission_delay_minutes, mission_streak_bonus, pilote:profiles!vols_pilote_id_fkey(identifiant)', { count: 'exact' })
      .eq('type_vol', TYPE_VOL_MILITAIRE);
    if (!canManage) query = query.or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id},chef_escadron_id.eq.${user.id}`);
    if (status !== 'tous') query = query.eq('statut', status);
    const { data: vols, count, error } = await query.order('depart_utc', { ascending: false }).order('id').range((page - 1) * 30, page * 30 - 1);
    if (error) throw error;
    let journal: unknown[] = [];
    if (canManage) {
      const result = await admin.from('armee_operations_log')
        .select('id, vol_id, action, created_at, actor:profiles!actor_id(identifiant)')
        .order('created_at', { ascending: false }).limit(20);
      if (result.error) throw result.error;
      journal = result.data || [];
    }
    return NextResponse.json({ vols, count, journal, canManage, page }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('GET armee/operations:', e);
    return NextResponse.json({ error: 'Impossible de charger les opérations Armée. Vérifiez que la mise à jour de la base a été appliquée.' }, { status: 503 });
  }
}
