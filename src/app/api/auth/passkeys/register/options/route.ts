export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { storeWebAuthnChallenge } from '@/lib/webauthn/challenges';
import { getWebAuthnOrigin, getWebAuthnRpId, getWebAuthnRpName } from '@/lib/webauthn/config';

/** Options d'inscription passkey (utilisateur authentifié). */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', user.id)
      .maybeSingle();

    const { data: existingPasskeys } = await admin
      .from('user_passkeys')
      .select('credential_id')
      .eq('user_id', user.id);

    const excludeCredentials = (existingPasskeys ?? []).map((p) => ({
      id: p.credential_id as string,
      type: 'public-key' as const,
    }));

    const options = await generateRegistrationOptions({
      rpName: getWebAuthnRpName(),
      rpID: getWebAuthnRpId(req),
      userName: profile?.identifiant ?? user.id,
      userDisplayName: profile?.identifiant ?? 'Utilisateur PTFS',
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        // Obligatoire dès l'enregistrement : la passkey exige une vérif utilisateur (biométrie/PIN).
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
    });

    await storeWebAuthnChallenge(admin, user.id, options.challenge, 'registration');

    return NextResponse.json(options);
  } catch (e) {
    console.error('[passkeys/register/options]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
