import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

/**
 * POST - Étape 2 : vérifier le code reçu par email et créer la demande d'accès.
 * Notifie tous les autres admins pour approbation.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code invalide (6 chiffres).' }, { status: 400 });
    }

    const { data: row } = await admin
      .from('superadmin_access_codes')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!row) {
      return NextResponse.json({ error: 'Code incorrect ou expiré.' }, { status: 400 });
    }

    await admin.from('superadmin_access_codes').delete().eq('user_id', user.id);

    const { data: request } = await admin
      .from('superadmin_ip_requests')
      .insert({
        requested_by: user.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (!request) {
      return NextResponse.json({ error: 'Erreur lors de la création de la demande.' }, { status: 500 });
    }

    const { data: otherAdmins } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .neq('id', user.id);

    if (otherAdmins?.length) {
      await admin.from('messages').insert(
        otherAdmins.map((a) => ({
          destinataire_id: a.id,
          expediteur_id: null,
          titre: 'Demande d\'accès à la liste des IP',
          contenu: `**${profile.identifiant}** demande l'accès à la liste des adresses IP et des comptes. Allez dans Admin > Consultation des IP pour approuver ou refuser.`,
          type_message: 'superadmin_ip_approval',
          metadata: { requestId: request.id, requestedById: user.id, requestedByIdentifiant: profile.identifiant },
        }))
      );
    }

    return NextResponse.json({ ok: true, requestId: request.id });
  } catch (e) {
    console.error('[superadmin verify-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
