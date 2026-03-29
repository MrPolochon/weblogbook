import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_PASSWORD = '1234567890';

/**
 * Réinitialisation du mot de passe par un administrateur, sans email envoyé au compte cible.
 * POST body: { user_id: string, new_password?: string (≥8), superadmin_code?: string }
 * - Si new_password est absent ou vide : mot de passe par défaut (1234567890).
 * - Si le compte cible a le rôle admin (et n'est pas soi-même) : superadmin_code obligatoire (même flux que promotion admin).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const newPasswordRaw = typeof body.new_password === 'string' ? body.new_password : '';
    const superadminCodeBody =
      typeof body.superadmin_code === 'string' ? body.superadmin_code.trim().replace(/\s/g, '') : '';

    if (!targetUserId) return NextResponse.json({ error: 'user_id requis.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: target } = await admin.from('profiles').select('id, role').eq('id', targetUserId).single();
    if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    const trimmed = newPasswordRaw.trim();
    const newPassword = trimmed.length > 0 ? trimmed : DEFAULT_PASSWORD;
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit faire au moins 8 caractères, ou laissez vide pour la valeur par défaut.' },
        { status: 400 }
      );
    }

    const isSelf = targetUserId === user.id;
    if (target.role === 'admin' && !isSelf) {
      if (superadminCodeBody.length !== 6 || !/^\d{6}$/.test(superadminCodeBody)) {
        return NextResponse.json(
          {
            code: 'SUPERADMIN_REQUIRED',
            error:
              'Pour réinitialiser le mot de passe d\'un autre administrateur, saisissez le code à 6 chiffres reçu par email (après « mot de passe superadmin »).',
          },
          { status: 403 }
        );
      }
      const { data: codeRow } = await admin
        .from('superadmin_access_codes')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('code', superadminCodeBody)
        .gt('expires_at', new Date().toISOString())
        .single();
      if (!codeRow) {
        return NextResponse.json(
          {
            code: 'SUPERADMIN_REQUIRED',
            error: 'Code superadmin incorrect ou expiré. Demandez un nouveau code par email.',
          },
          { status: 403 }
        );
      }
      await admin.from('superadmin_access_codes').delete().eq('user_id', user.id);
    }

    const { error: pwdErr } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
    if (pwdErr) {
      return NextResponse.json({ error: pwdErr.message || 'Erreur mise à jour du mot de passe.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, used_default: trimmed.length === 0 });
  } catch (e) {
    console.error('[reset-user-password]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
