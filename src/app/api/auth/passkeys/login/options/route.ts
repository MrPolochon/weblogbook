import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWebAuthnRpId } from '@/lib/webauthn/config';
import { rateLimitShared } from '@/lib/rate-limit-shared';
import { getClientIp } from '@/lib/ip-utils';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimitShared(`passkey-login-options:${getClientIp(req) ?? 'unknown'}`, 20, 15*60*1000)).allowed)
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 });
    const options = await generateAuthenticationOptions({ rpID: getWebAuthnRpId(req), userVerification: 'required' });
    const nonce = randomBytes(32).toString('hex');
    const admin = createAdminClient();
    const { error } = await admin.from('passkey_login_challenges').insert({ nonce_hash: createHash('sha256').update(nonce).digest('hex'), challenge: options.challenge, expires_at: new Date(Date.now()+300000).toISOString() });
    if (error) throw new Error('challenge');
    const res = NextResponse.json(options);
    res.cookies.set('passkey_login_nonce', nonce, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'strict', path: '/api/auth/passkeys/login', maxAge: 300 });
    return res;
  } catch { return NextResponse.json({ error: 'Connexion par passkey temporairement indisponible.' }, { status: 503 }); }
}
