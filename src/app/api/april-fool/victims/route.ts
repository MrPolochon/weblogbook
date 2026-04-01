import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { getParisCalendarYear } from '@/lib/paris-date';

export const dynamic = 'force-dynamic';

/**
 * GET — liste publique des identifiants profil ayant validé la blague (palmarès).
 * Lecture via service role (pas de session requise) : visible par tous sur le site.
 */
export async function GET(req: Request) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    let year = getParisCalendarYear();
    const y = searchParams.get('year');
    if (y) {
      const parsed = parseInt(y, 10);
      if (!Number.isFinite(parsed) || parsed < 2020 || parsed > 2100) {
        return NextResponse.json({ error: 'year invalide' }, { status: 400 });
      }
      year = parsed;
    }

    const { data: acks, error: ackErr } = await admin
      .from('april_fool_ack')
      .select('user_id')
      .eq('year', year)
      .order('ack_at', { ascending: true });

    if (ackErr) {
      console.error('april_fool victims:', ackErr.message);
      return NextResponse.json({ error: ackErr.message }, { status: 500 });
    }

    const userIds = Array.from(new Set((acks ?? []).map((a) => a.user_id)));
    if (userIds.length === 0) {
      return NextResponse.json({ year, identifiers: [] as string[] });
    }

    const { data: profs, error: profErr } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('id', userIds);

    if (profErr) {
      console.error('april_fool victims profiles:', profErr.message);
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    const byId = new Map((profs ?? []).map((p) => [p.id, p.identifiant as string]));
    const identifiers = (acks ?? [])
      .map((a) => byId.get(a.user_id))
      .filter((x): x is string => Boolean(x));

    return NextResponse.json({ year, identifiers });
  } catch (e) {
    console.error('april-fool victims:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
