import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
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
