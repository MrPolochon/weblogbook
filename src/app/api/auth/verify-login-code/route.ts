import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

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

    const { allowed } = rateLimit(`verify-code:${user.id}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 });
    }

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
    const { data: trackingBefore } = await admin
      .from('user_login_tracking')
      .select('last_login_ip')
      .eq('user_id', user.id)
      .maybeSingle();
    const previousIp = trackingBefore?.last_login_ip ?? null;

    const profileUpdates: { email?: string } = {};
    if (row.pending_email) profileUpdates.email = row.pending_email;
    if (Object.keys(profileUpdates).length > 0) {
      const { error: updErr } = await admin.from('profiles').update(profileUpdates).eq('id', user.id);
      if (updErr) {
        console.error('[verify-login-code] profile update error:', updErr);
        // On NE supprime PAS le code pour permettre à l'utilisateur de réessayer
        // sans bloquer son compte dans un état incohérent.
        const isUnique = updErr.code === '23505';
        return NextResponse.json(
          {
            error: isUnique
              ? 'Cet email est déjà utilisé par un autre compte. Indiquez une autre adresse.'
              : 'Impossible d’enregistrer votre email. Réessayez ou contactez l’administrateur.',
          },
          { status: 409 }
        );
      }
    }

    if (ip != null) {
      await admin.from('user_login_tracking').upsert({
        user_id: user.id,
        last_login_ip: ip,
        last_login_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
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
