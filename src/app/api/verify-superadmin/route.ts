export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { requireSiteAdmin } from '@/lib/calendrier/staff';

/**
 * Vérifie SUPERADMIN_PASSWORD pour un flux déjà authentifié admin
 * (ex. mode éditeur marché). Pas d’oracle public : session admin obligatoire.
 * Les accès sensibles (radar, IFSA, IPs) passent par /api/admin/superadmin/request-access.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }
    const staff = await requireSiteAdmin(user.id);
    if (!staff) {
      return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const rl = rateLimit(`verify-superadmin:${staff.id}:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, { status: 429 });
    }
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
