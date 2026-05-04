import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { fetchAtisBot } from '@/lib/atis-bot-api';
import { getControlledInstance } from '@/lib/atis-instance-resolver';

export const dynamic = 'force-dynamic';

export async function POST() {
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
      {
        error: 'Démarrez d\'abord un ATIS pour basculer CAVOK.',
      },
      { status: 409 }
    );
  }

  const result = await fetchAtisBot<{ ok: boolean; cavok: boolean }>(
    '/webhook/toggle-cavok',
    { method: 'POST', instanceId }
  );
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
