import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAtisBot } from '@/lib/atis-bot-api';
import { getControlledInstance } from '@/lib/atis-instance-resolver';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));

  // Routage multi-instance : on cible l'instance contrôlée par l'ATC.
  let instanceId = await getControlledInstance(user.id);

  // Admin : peut cibler une instance précise via body.instance_id (kill switch).
  const isAdmin = profile?.role === 'admin';
  if (isAdmin && body.instance_id !== undefined) {
    const explicit = parseInt(String(body.instance_id), 10);
    if (Number.isFinite(explicit)) instanceId = explicit;
  }

  if (!instanceId) {
    return NextResponse.json(
      {
        error: 'Démarrez d\'abord un ATIS depuis le panneau pour pouvoir changer son code.',
      },
      { status: 409 }
    );
  }

  const result = await fetchAtisBot<{ ok: boolean; code: string }>('/webhook/atiscode', {
    method: 'POST',
    body: { code: body.code },
    instanceId,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
