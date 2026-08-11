import type { SupabaseClient } from '@supabase/supabase-js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type WebAuthnChallengeType = 'registration' | 'authentication';

export async function storeWebAuthnChallenge(
  admin: SupabaseClient,
  userId: string,
  challenge: string,
  type: WebAuthnChallengeType
): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await admin.from('webauthn_challenges').delete().eq('user_id', userId).eq('type', type);
  await admin.from('webauthn_challenges').insert({
    user_id: userId,
    challenge,
    type,
    expires_at: expiresAt,
  });
}

export async function consumeWebAuthnChallenge(
  admin: SupabaseClient,
  userId: string,
  type: WebAuthnChallengeType
): Promise<string | null> {
  const { data } = await admin
    .from('webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('user_id', userId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.challenge) return null;
  if (new Date(data.expires_at as string) < new Date()) {
    await admin.from('webauthn_challenges').delete().eq('id', data.id);
    return null;
  }

  await admin.from('webauthn_challenges').delete().eq('id', data.id);
  return data.challenge as string;
}
