import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST - Arrêter le broadcast ATIS
 * Seul l'ATC qui a démarré peut arrêter (ou admin)
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const admin = createAdminClient();
    const { data: state } = await admin.from('atis_broadcast_state').select('controlling_user_id').eq('id', 'default').single();
    if (state?.controlling_user_id && state.controlling_user_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul l\'ATC qui a démarré le broadcast peut l\'arrêter.' }, { status: 403 });
    }

    const botUrl = process.env.ATIS_WEBHOOK_URL;
    const botSecret = process.env.ATIS_WEBHOOK_SECRET;
    if (botUrl && botSecret) {
      await fetch(`${botUrl.replace(/\/$/, '')}/webhook/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botSecret}`, 'X-ATIS-Secret': botSecret },
      }).catch(console.error);
    }

    await admin.from('atis_broadcast_state').upsert({
      id: 'default',
      controlling_user_id: null,
      aeroport: null,
      position: null,
      broadcasting: false,
      started_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return NextResponse.json({ ok: true, broadcasting: false });
  } catch (e) {
    console.error('ATIS stop:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
