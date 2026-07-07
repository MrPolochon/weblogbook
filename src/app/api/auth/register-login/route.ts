export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { getClientIp, normalizeIp } from '@/lib/ip-utils';

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

    // Normaliser l'IP lue en base (peut contenir l'ancien format ::ffff:x.x.x.x)
    const previousIp = tracking?.last_login_ip ? normalizeIp(tracking.last_login_ip) : null;
    const requireCode = !previousIp || (ip != null && ip !== previousIp);

    // Même IP (ou IP actuelle indisponible mais déjà une IP en base) : on enregistre
    // toujours last_login_at pour l'inactivité admin. Sinon l'IP null en dev / proxy
    // empêchait toute mise à jour alors que le compte est bien connecté.
    if (!requireCode) {
      const loginIp = ip ?? previousIp ?? null;
      await admin.from('user_login_tracking').upsert(
        {
          user_id: user.id,
          last_login_ip: loginIp,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      try {
        await admin
          .from('profiles')
          .update({
            inactivity_warning_status: null,
            inactivity_warning_error: null,
            inactivity_warned_at: null,
            inactivity_delete_after: null,
          })
          .eq('id', user.id)
          .not('inactivity_warning_status', 'is', null);
      } catch {
        // Migration add_inactivity_warnings.sql peut ne pas etre encore appliquee
      }
    }

    return NextResponse.json({ ok: true, requireCode });
  } catch (e) {
    console.error('[register-login]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
