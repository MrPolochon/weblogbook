import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { fetchAtisBot } from '@/lib/atis-bot-api';
import { getControlledInstance } from '@/lib/atis-instance-resolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/atc/atis/replay
 *
 * Met à jour l'ATIS diffusé puis coupe le message vocal en cours pour
 * relire immédiatement le nouveau texte (sans quitter le canal Discord).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, atc')
    .eq('id', user.id)
    .single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

  const instanceId = await getControlledInstance(user.id);
  if (!instanceId) {
    return NextResponse.json(
      { error: "Démarrez d'abord un ATIS depuis le panneau pour le modifier." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const informationCode =
    typeof body.information_code === 'string' ? body.information_code.trim().toUpperCase() : '';

  const patchRes = await fetchAtisBot<{
    ok?: boolean;
    data?: Record<string, unknown>;
    bilingual_mode?: boolean;
  }>('/webhook/atis-data', {
    method: 'PATCH',
    body,
    instanceId,
  });
  if (patchRes.error) {
    return NextResponse.json({ error: patchRes.error }, { status: patchRes.status });
  }

  if (informationCode.length === 1 && informationCode >= 'A' && informationCode <= 'Z') {
    await fetchAtisBot('/webhook/atiscode', {
      method: 'POST',
      body: { code: informationCode },
      instanceId,
    });
  }

  const replayRes = await fetchAtisBot<{ ok?: boolean; replayed?: boolean }>('/webhook/replay', {
    method: 'POST',
    instanceId,
    timeoutMs: 8000,
  });

  if (replayRes.error && replayRes.status !== 404 && replayRes.status !== 409) {
    return NextResponse.json(
      {
        ok: true,
        replayed: false,
        data: patchRes.data?.data,
        bilingual_mode: patchRes.data?.bilingual_mode,
        warning: "Données envoyées, mais le bot n'a pas pu interrompre la lecture en cours.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    replayed: Boolean(replayRes.data?.replayed) || replayRes.status === 200,
    data: patchRes.data?.data,
    bilingual_mode: patchRes.data?.bilingual_mode,
  });
}
