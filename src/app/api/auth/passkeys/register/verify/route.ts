export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { consumeWebAuthnChallenge } from '@/lib/webauthn/challenges';
import {
  desktopPlatformAuthenticatorError,
  getWebAuthnOrigin,
  getWebAuthnRpId,
  nodeBufferToBase64url,
} from '@/lib/webauthn/config';

/** Vérifie et enregistre une nouvelle passkey. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const response = body.response;
    const deviceName =
      typeof body.deviceName === 'string' && body.deviceName.trim()
        ? body.deviceName.trim().slice(0, 120)
        : null;

    if (!response) {
      return NextResponse.json({ error: 'Réponse WebAuthn manquante.' }, { status: 400 });
    }

    const platformError = desktopPlatformAuthenticatorError(req, response);
    if (platformError) {
      return NextResponse.json({ error: platformError }, { status: 400 });
    }

    const admin = createAdminClient();
    const expectedChallenge = await consumeWebAuthnChallenge(admin, user.id, 'registration');
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge expiré. Réessayez.' }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getWebAuthnOrigin(req),
      expectedRPID: getWebAuthnRpId(req),
      requireUserVerification: true,
    });

    if (
      !verification.verified ||
      !verification.registrationInfo ||
      !verification.registrationInfo.userVerified
    ) {
      return NextResponse.json(
        { error: 'Enregistrement refusé : la vérification biométrique (ou PIN appareil) est obligatoire.' },
        { status: 400 }
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const credentialId =
      typeof credential.id === 'string'
        ? credential.id
        : nodeBufferToBase64url(credential.id);
    const publicKey = nodeBufferToBase64url(credential.publicKey);

    const defaultName =
      deviceName ??
      (credentialDeviceType === 'singleDevice' ? 'Appareil (biométrie locale)' : 'Clé de sécurité');

    const { error: insertErr } = await admin.from('user_passkeys').insert({
      user_id: user.id,
      credential_id: credentialId,
      public_key: publicKey,
      counter: credential.counter,
      device_name: defaultName,
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return NextResponse.json({ error: 'Cette passkey est déjà enregistrée.' }, { status: 409 });
      }
      console.error('[passkeys/register/verify] insert', insertErr);
      return NextResponse.json({ error: 'Impossible d’enregistrer la passkey.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deviceName: defaultName,
      backedUp: credentialBackedUp,
    });
  } catch (e) {
    console.error('[passkeys/register/verify]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
