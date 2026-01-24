import { NextRequest, NextResponse } from 'next/server';

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

    if (password !== expected) {
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
