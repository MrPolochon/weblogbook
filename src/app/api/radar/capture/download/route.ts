import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { hasApprovedRadarAccessForUser } from '@/lib/radar-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, radar_beta')
      .eq('id', user.id)
      .single();

    const hasAccess = await hasApprovedRadarAccessForUser(user.id, profile?.role, profile?.radar_beta);
    if (!profile || !hasAccess) {
      return NextResponse.json({ error: 'Accès radar non autorisé' }, { status: 403 });
    }

    // Primary behavior: direct download served by the site from public/downloads.
    const publicExePath = path.join(process.cwd(), 'public', 'downloads', 'RadarCapture.exe');
    await fs.access(publicExePath);

    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/downloads/RadarCapture.exe`);
  } catch {
    return NextResponse.json(
      {
        error:
          "Fichier indisponible. Placez RadarCapture.exe dans public/downloads/RadarCapture.exe pour activer le telechargement direct.",
      },
      { status: 404 },
    );
  }
}
