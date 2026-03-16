import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET - État du broadcast ATIS (pour le bouton et le ticker)
 * Récupère l'état depuis Supabase + le texte actuel depuis le bot ATIS
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc, atis_ticker_visible, atis_code_auto_rotate').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const admin = createAdminClient();
    let state: { controlling_user_id?: string; aeroport?: string; position?: string; broadcasting?: boolean } | null = null;
    try {
      const { data } = await admin.from('atis_broadcast_state').select('*').eq('id', 'default').maybeSingle();
      state = data;
    } catch {
      // Table peut ne pas exister si migration non exécutée
    }

    let atisText: string | null = null;
    let botBroadcasting = false;
    const botUrl = process.env.ATIS_WEBHOOK_URL;
    const botSecret = process.env.ATIS_WEBHOOK_SECRET;
    if (botUrl && botSecret && state?.broadcasting) {
      try {
        const res = await fetch(`${botUrl.replace(/\/$/, '')}/webhook/status`, {
          headers: { Authorization: `Bearer ${botSecret}`, 'X-ATIS-Secret': botSecret },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          botBroadcasting = !!data.broadcasting;
          atisText = data.atis_text ?? null;
        }
      } catch (e) {
        console.error('ATIS bot status fetch:', e);
      }
    }

    return NextResponse.json({
      controlling_user_id: state?.controlling_user_id ?? null,
      aeroport: state?.aeroport ?? null,
      position: state?.position ?? null,
      broadcasting: state?.broadcasting && botBroadcasting,
      atis_text: atisText,
      atis_ticker_visible: profile?.atis_ticker_visible ?? true,
      atis_code_auto_rotate: profile?.atis_code_auto_rotate ?? false,
    });
  } catch (e) {
    console.error('ATIS status:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
