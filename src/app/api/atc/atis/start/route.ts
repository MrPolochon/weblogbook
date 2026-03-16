import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST - Démarrer le broadcast ATIS (un seul ATC peut contrôler)
 * Appelle le bot Discord puis met à jour Supabase
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const body = await request.json();
    const { aeroport, position } = body;
    if (!aeroport || !position) return NextResponse.json({ error: 'aeroport et position requis' }, { status: 400 });

    const admin = createAdminClient();
    const { data: existing } = await admin.from('atis_broadcast_state').select('controlling_user_id, broadcasting').eq('id', 'default').single();
    if (existing?.broadcasting && existing?.controlling_user_id && existing.controlling_user_id !== user.id) {
      return NextResponse.json({ error: 'Un autre ATC contrôle déjà le bot ATIS.' }, { status: 400 });
    }

    const botUrl = process.env.ATIS_WEBHOOK_URL;
    const botSecret = process.env.ATIS_WEBHOOK_SECRET;
    if (!botUrl || !botSecret) {
      return NextResponse.json({ error: 'Bot ATIS non configuré (ATIS_WEBHOOK_URL/SECRET).' }, { status: 503 });
    }

    const res = await fetch(`${botUrl.replace(/\/$/, '')}/webhook/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botSecret}`, 'X-ATIS-Secret': botSecret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Échec du démarrage du bot ATIS' }, { status: res.status >= 400 ? res.status : 500 });
    }

    await admin.from('atis_broadcast_state').upsert({
      id: 'default',
      controlling_user_id: user.id,
      aeroport: String(aeroport),
      position: String(position),
      broadcasting: true,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return NextResponse.json({ ok: true, broadcasting: true });
  } catch (e) {
    console.error('ATIS start:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
