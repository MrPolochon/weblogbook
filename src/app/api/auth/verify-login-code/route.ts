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
 * Vérifie le code à 6 chiffres saisi par l'utilisateur.
 * Si valide : enregistre l'IP de connexion (last_login_ip), supprime le code,
 * retourne ok (le client retirera le cookie pending_verification).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code invalide (6 chiffres requis).' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('login_verification_codes')
      .select('user_id, pending_email')
      .eq('user_id', user.id)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!row) {
      return NextResponse.json({ error: 'Code incorrect ou expiré.' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') ?? null;
    const { data: profileBefore } = await admin
      .from('profiles')
      .select('last_login_ip')
      .eq('id', user.id)
      .single();
    const previousIp = profileBefore?.last_login_ip ?? null;

    const updates: { email?: string; last_login_ip?: string; last_login_at?: string } = {
      last_login_at: new Date().toISOString(),
    };
    if (ip) updates.last_login_ip = ip;
    if (row.pending_email) updates.email = row.pending_email;

    await admin.from('profiles').update(updates).eq('id', user.id);
    await admin.from('login_verification_codes').delete().eq('user_id', user.id);

    if (ip) {
      try {
        await admin.from('login_ip_history').insert({
          user_id: user.id,
          ip,
          previous_ip: previousIp,
          user_agent: userAgent,
        });
      } catch {
        // Table login_ip_history peut ne pas exister (migration non exécutée)
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[verify-login-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
