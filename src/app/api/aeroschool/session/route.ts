export const dynamic = 'force-dynamic';
import { getAeroSchoolRespondent } from '@/lib/aeroschool-auth';
import { NextResponse } from 'next/server';

/** Profil du répondant connecté (null si anonyme). */
export async function GET() {
  try {
    const profile = await getAeroSchoolRespondent();
    if (!profile) {
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({
      authenticated: true,
      userId: profile.userId,
      identifiant: profile.identifiant,
      discordUsername: profile.discordUsername,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
