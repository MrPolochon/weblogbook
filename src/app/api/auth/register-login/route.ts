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
 * Enregistre la connexion, met à jour l'IP et notifie les admins si un admin
 * se connecte depuis une IP différente de la dernière connue.
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

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, identifiant, role, last_login_ip')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ ok: true }); // pas de profil = on ignore
    }

    const previousIp = profile.last_login_ip ?? null;
    const ipChanged =
      ip != null && previousIp != null && ip !== previousIp;
    const isAdmin = profile.role === 'admin';

    if (isAdmin && ipChanged && ip) {
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      const titre = 'Alerte connexion depuis une nouvelle IP';
      const contenu = `L'administrateur **${profile.identifiant}** s'est connecté depuis une nouvelle adresse IP.\n\nAncienne IP : ${previousIp}\nNouvelle IP : ${ip}\n\nSi ce n'était pas vous, changez immédiatement votre mot de passe et vérifiez les accès.`;

      if (admins?.length) {
        await admin.from('messages').insert(
          admins.map((a) => ({
            destinataire_id: a.id,
            expediteur_id: null,
            titre,
            contenu,
            type_message: 'alerte_connexion',
          }))
        );
      }
    }

    if (ip != null) {
      await admin
        .from('profiles')
        .update({
          last_login_ip: ip,
          last_login_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[register-login]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
