import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ARME_MISSIONS } from '@/lib/armee-missions';

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function GET() {
  return NextResponse.json(ARME_MISSIONS);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('armee, role').eq('id', user.id).single();
    if (!profile?.armee && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux utilisateurs avec le rôle Armée (ou aux admins).' }, { status: 403 });
    }

    const body = await request.json();
    const missionId = String(body.mission_id || '');
    const mission = ARME_MISSIONS.find((m) => m.id === missionId);
    if (!mission) return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });

    const admin = createAdminClient();

    const { data: compteMilitaire } = await admin.from('felitz_comptes')
      .select('id, solde')
      .eq('type', 'militaire')
      .single();
    if (!compteMilitaire) return NextResponse.json({ error: 'Compte militaire introuvable.' }, { status: 404 });

    const cooldownMs = mission.cooldownMinutes * 60000;
    const nowMs = Date.now();

    // Cooldown global (évite abus collectif)
    const { data: lastGlobal } = await admin.from('armee_missions_log')
      .select('created_at')
      .eq('mission_id', mission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastGlobal?.created_at) {
      const last = new Date(lastGlobal.created_at).getTime();
      if (nowMs - last < cooldownMs) {
        return NextResponse.json({ error: `Mission indisponible (cooldown global ${mission.cooldownMinutes} min).` }, { status: 400 });
      }
    }

    // Cooldown personnel
    const { data: lastUser } = await admin.from('armee_missions_log')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('mission_id', mission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastUser?.created_at) {
      const last = new Date(lastUser.created_at).getTime();
      if (nowMs - last < cooldownMs) {
        return NextResponse.json({ error: `Mission en cooldown (${mission.cooldownMinutes} min).` }, { status: 400 });
      }
    }

    const reward = randomBetween(mission.rewardMin, mission.rewardMax);

    await admin.from('felitz_comptes')
      .update({ solde: compteMilitaire.solde + reward })
      .eq('id', compteMilitaire.id);

    await admin.from('felitz_transactions').insert({
      compte_id: compteMilitaire.id,
      type: 'credit',
      montant: reward,
      libelle: `Mission militaire: ${mission.titre}`
    });

    await admin.from('armee_missions_log').insert({
      mission_id: mission.id,
      user_id: user.id,
      reward
    });

    return NextResponse.json({ ok: true, reward });
  } catch (e) {
    console.error('Armee mission POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
