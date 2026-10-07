import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWebAuthnOrigin, getWebAuthnRpId, nodeBase64urlToBuffer, needsMonthlyEmailVerification } from '@/lib/webauthn/config';
import { rateLimitShared } from '@/lib/rate-limit-shared';
import { getClientIp } from '@/lib/ip-utils';
import { createSessionFromVerifiedIdentity } from '@/lib/auth/session-from-identity';
import { getLastEmailVerificationAt, completeLoginVerification } from '@/lib/auth/complete-login-verification';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const reply = (data: object, status = 200) => {
    const res = NextResponse.json(data, { status });
    res.cookies.set('passkey_login_nonce', '', { path: '/api/auth/passkeys/login', maxAge: 0 });
    return res;
  };
  try {
    if (!(await rateLimitShared(`passkey-login-verify:${getClientIp(req) ?? 'unknown'}`, 10, 15*60*1000)).allowed) return reply({ error: 'Trop de tentatives.' }, 429);
    const nonce = req.cookies.get('passkey_login_nonce')?.value;
    const body = await req.json().catch(() => ({}));
    if (!nonce || !/^[a-f0-9]{64}$/.test(nonce) || typeof body.response?.id !== 'string') return reply({ error: 'Vérification expirée. Réessayez.' }, 400);
    const admin = createAdminClient();
    const { data: challenge, error: challengeError } = await admin.from('passkey_login_challenges').delete()
      .eq('nonce_hash', createHash('sha256').update(nonce).digest('hex')).gt('expires_at', new Date().toISOString()).select('challenge').maybeSingle();
    if (challengeError || !challenge) return reply({ error: 'Vérification expirée. Réessayez.' }, 400);
    const { data: credential, error } = await admin.from('user_passkeys').select('id,user_id,credential_id,public_key,counter').eq('credential_id', body.response.id).maybeSingle();
    if (error || !credential) return reply({ error: 'Passkey non reconnue. Utilisez votre mot de passe.' }, 400);
    const verification = await verifyAuthenticationResponse({ response: body.response, expectedChallenge: challenge.challenge,
      expectedOrigin: getWebAuthnOrigin(req), expectedRPID: getWebAuthnRpId(req), requireUserVerification: true,
      credential: { id: credential.credential_id, publicKey: new Uint8Array(nodeBase64urlToBuffer(credential.public_key)), counter: Number(credential.counter) } });
    if (!verification.verified || !verification.authenticationInfo.userVerified) return reply({ error: 'Vérification refusée.' }, 400);
    const { data: updated, error: updateError } = await admin.from('user_passkeys').update({ counter: verification.authenticationInfo.newCounter }).eq('id',credential.id).eq('counter',credential.counter).select('id').maybeSingle();
    if (updateError || !updated) return reply({ error: 'Une autre connexion est en cours. Réessayez.' }, 409);
    const supabase = await createSessionFromVerifiedIdentity(credential.user_id);
    const forceEmail = needsMonthlyEmailVerification(await getLastEmailVerificationAt(admin,credential.user_id));
    if (!forceEmail) {
      const completed = await completeLoginVerification(admin, credential.user_id, req);
      if (!completed.ok) { await supabase.auth.signOut(); return reply({ error: completed.error }, completed.status); }
    }
    const res = reply({ ok: true, forceEmail });
    if (forceEmail) res.cookies.set('pending_login_verification', '1', { path: '/', sameSite: 'lax', secure: req.nextUrl.protocol==='https:', maxAge: 600 });
    else res.cookies.set('pending_login_verification','',{path:'/',maxAge:0});
    return res;
  } catch { return reply({ error: 'La connexion a échoué. Réessayez ou utilisez votre mot de passe.' }, 400); }
}
