import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return null;
}

/**
 * Enregistre la connexion et indique si un code de confirmation par email est requis.
 * - Pas d'IP enregistrée → requireCode true (on met à jour l'IP uniquement après validation du code).
 * - IP différente de la dernière connue → requireCode true.
 * - Même IP → requireCode false, on met à jour last_login_at et on laisse accéder sans code.
 * Les IP sont consultables uniquement via SQL dans Supabase (pas d'interface liste des IP).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const ip = getClientIp(req);
    const admin = createAdminClient();

    const { data: tracking } = await admin
      .from('user_login_tracking')
      .select('last_login_ip')
      .eq('user_id', user.id)
      .maybeSingle();

    const previousIp = tracking?.last_login_ip ?? null;
    const requireCode = !previousIp || (ip != null && ip !== previousIp);

    if (!requireCode && ip != null) {
      await admin
        .from('user_login_tracking')
        .upsert({
          user_id: user.id,
          last_login_ip: ip,
          last_login_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    return NextResponse.json({ ok: true, requireCode });
  } catch (e) {
    console.error('[register-login]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
