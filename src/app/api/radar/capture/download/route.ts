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

    const publicExePath = path.join(process.cwd(), 'public', 'downloads', 'RadarCapture.exe');
    const builtExePath = path.join(process.cwd(), 'radar-capture', 'dist', 'RadarCapture.exe');

    try {
      await fs.access(builtExePath);
      const fileBuffer = await fs.readFile(builtExePath);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="RadarCapture.exe"',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      await fs.access(publicExePath);
      const origin = new URL(request.url).origin;
      return NextResponse.redirect(`${origin}/downloads/RadarCapture.exe`);
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Fichier indisponible. Generez RadarCapture.exe depuis radar-capture/dist ou placez-le dans public/downloads/RadarCapture.exe.",
      },
      { status: 404 },
    );
  }
}
