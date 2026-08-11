import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientIp } from '@/lib/ip-utils';

export type CompleteLoginVerificationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Finalise une vérification de connexion (code email ou passkey).
 * Met à jour IP, historique, inactivité et éventuellement last_email_verification_at.
 */
export async function completeLoginVerification(
  admin: SupabaseClient,
  userId: string,
  req: NextRequest,
  options: {
    pendingEmail?: string | null;
    recordEmailVerification?: boolean;
  } = {}
): Promise<CompleteLoginVerificationResult> {
  const { pendingEmail = null, recordEmailVerification = false } = options;

  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') ?? null;

  const { data: trackingBefore } = await admin
    .from('user_login_tracking')
    .select('last_login_ip')
    .eq('user_id', userId)
    .maybeSingle();
  const previousIp = trackingBefore?.last_login_ip ?? null;

  if (pendingEmail) {
    const { error: updErr } = await admin.from('profiles').update({ email: pendingEmail }).eq('id', userId);
    if (updErr) {
      const isUnique = updErr.code === '23505';
      return {
        ok: false,
        status: 409,
        error: isUnique
          ? 'Cet email est déjà utilisé par un autre compte. Indiquez une autre adresse.'
          : 'Impossible d’enregistrer votre email. Réessayez ou contactez l’administrateur.',
      };
    }
  }

  const now = new Date().toISOString();
  const loginIp = ip ?? previousIp ?? null;
  const trackingUpdate: Record<string, string | null> = {
    user_id: userId,
    last_login_ip: loginIp,
    last_login_at: now,
  };
  if (recordEmailVerification) {
    trackingUpdate.last_email_verification_at = now;
  }

  await admin.from('user_login_tracking').upsert(trackingUpdate, { onConflict: 'user_id' });
  await admin.from('login_verification_codes').delete().eq('user_id', userId);

  try {
    await admin
      .from('profiles')
      .update({
        inactivity_warning_status: null,
        inactivity_warning_error: null,
        inactivity_warned_at: null,
        inactivity_delete_after: null,
      })
      .eq('id', userId)
      .not('inactivity_warning_status', 'is', null);
  } catch {
    // Migration add_inactivity_warnings.sql peut ne pas être appliquée
  }

  if (loginIp) {
    try {
      await admin.from('login_ip_history').insert({
        user_id: userId,
        ip: loginIp,
        previous_ip: previousIp,
        user_agent: userAgent,
      });
    } catch {
      // Table login_ip_history peut ne pas exister
    }
  }

  return { ok: true };
}

/** Indique si l'utilisateur possède au moins une passkey enregistrée. */
export async function userHasPasskeys(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('user_passkeys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Lit last_email_verification_at (null si colonne absente ou pas de ligne). */
export async function getLastEmailVerificationAt(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from('user_login_tracking')
    .select('last_email_verification_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return (data?.last_email_verification_at as string | null) ?? null;
}
