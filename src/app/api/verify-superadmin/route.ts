export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    const expected = process.env.SUPERADMIN_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { error: 'Mot de passe superadmin non configuré.' },
        { status: 500 }
      );
    }

    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Mot de passe incorrect.' }, { status: 401 });
    }

    // Comparaison en temps constant pour éviter les timing attacks.
    // On hache les deux valeurs pour que les buffers aient la même longueur,
    // indépendamment de la longueur du mot de passe fourni.
    const hashInput    = createHash('sha256').update(password).digest();
    const hashExpected = createHash('sha256').update(expected).digest();

    if (!timingSafeEqual(hashInput, hashExpected)) {
      return NextResponse.json(
        { error: 'Mot de passe incorrect.' },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Erreur lors de la vérification.' },
      { status: 500 }
    );
  }
}
