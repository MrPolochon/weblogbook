export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { storeWebAuthnChallenge } from '@/lib/webauthn/challenges';
import { getWebAuthnRpId, getWebAuthnRpName, webauthnCeremonyHints } from '@/lib/webauthn/config';

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

    const { hints, authenticatorAttachment } = webauthnCeremonyHints(req);

    // PC : cross-platform + hint hybrid → QR téléphone, sans le sélecteur
    // « clé d'accès » Windows (comptes déjà enregistrés sur la machine).
    // Mobile : platform → Face ID / empreinte de cet appareil.
    const options = await generateRegistrationOptions({
      rpName: getWebAuthnRpName(),
      rpID: getWebAuthnRpId(req),
      userName: profile?.identifiant ?? user.id,
      userDisplayName: profile?.identifiant ?? 'Utilisateur PTFS',
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment,
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    await storeWebAuthnChallenge(admin, user.id, options.challenge, 'registration');

    return NextResponse.json({
      ...options,
      hints,
    });
  } catch (e) {
    console.error('[passkeys/register/options]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
