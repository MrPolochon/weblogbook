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
      .order('ack_at', { ascending: true })
      .limit(10_000);

    if (ackErr) {
      console.error('april_fool victims:', ackErr.message);
      return NextResponse.json({ error: ackErr.message }, { status: 500 });
    }

    const uniqueOrderedIds: string[] = [];
    const seen = new Set<string>();
    for (const row of acks ?? []) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      uniqueOrderedIds.push(row.user_id);
    }

    if (uniqueOrderedIds.length === 0) {
      return NextResponse.json({ year, identifiers: [] as string[] });
    }

    const IN_BATCH = 120;
    const profRows: { id: string; identifiant: string | null }[] = [];
    for (let i = 0; i < uniqueOrderedIds.length; i += IN_BATCH) {
      const slice = uniqueOrderedIds.slice(i, i + IN_BATCH);
      const { data: profs, error: profErr } = await admin
        .from('profiles')
        .select('id, identifiant')
        .in('id', slice);

      if (profErr) {
        console.error('april_fool victims profiles:', profErr.message);
        return NextResponse.json({ error: profErr.message }, { status: 500 });
      }
      profRows.push(...(profs ?? []));
    }

    const byId = new Map<string, string>();
    for (const p of profRows) {
      if (p.identifiant) byId.set(p.id, p.identifiant);
    }
    const identifiers = uniqueOrderedIds
      .map((id) => byId.get(id))
      .filter((x): x is string => Boolean(x));

    return NextResponse.json({ year, identifiers });
  } catch (e) {
    console.error('april-fool victims:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
