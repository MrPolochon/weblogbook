import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: demandeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: demande } = await admin.from('reparation_demandes')
    .select('id, entreprise_id, statut')
    .eq('id', demandeId).single();
  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  if (!['en_reparation', 'mini_jeux'].includes(demande.statut)) {
    return NextResponse.json({ error: 'Pas en cours de réparation' }, { status: 400 });
  }

  const { data: emp } = await admin.from('reparation_employes')
    .select('id').eq('entreprise_id', demande.entreprise_id).eq('user_id', user.id).limit(1);
  if (!emp?.length) return NextResponse.json({ error: 'Non employé' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { type_jeu, score, duree_secondes } = body;

  const validTypes = ['inspection', 'calibrage', 'assemblage', 'test_moteur'];
  if (!validTypes.includes(type_jeu)) return NextResponse.json({ error: 'Type de jeu invalide' }, { status: 400 });
  if (typeof score !== 'number' || score < 0 || score > 100) return NextResponse.json({ error: 'Score 0-100' }, { status: 400 });
  if (!duree_secondes || duree_secondes < 5) return NextResponse.json({ error: 'Durée trop courte (anti-triche)' }, { status: 400 });

  const MIN_DURATIONS: Record<string, number> = {
    inspection: 10,
    calibrage: 8,
    assemblage: 12,
    test_moteur: 15,
  };
  if (duree_secondes < (MIN_DURATIONS[type_jeu] || 5)) {
    return NextResponse.json({ error: 'Durée suspecte (anti-triche)' }, { status: 400 });
  }

  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));

  const { error } = await admin.from('reparation_mini_jeux_scores').upsert({
    demande_id: demandeId,
    type_jeu,
    score: clampedScore,
    duree_secondes: Math.round(duree_secondes),
  }, { onConflict: 'demande_id,type_jeu' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (demande.statut === 'en_reparation') {
    await admin.from('reparation_demandes').update({ statut: 'mini_jeux' }).eq('id', demandeId);
  }

  const { data: allScores } = await admin.from('reparation_mini_jeux_scores')
    .select('type_jeu, score').eq('demande_id', demandeId);
  const completed = validTypes.every(t => allScores?.some(s => s.type_jeu === t));

  return NextResponse.json({
    ok: true,
    score: clampedScore,
    all_completed: completed,
    scores: allScores || [],
  });
}
