import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyRateLimit } from '@/lib/rate-limit';
import { FLIGHT_REVIEWS_FEED_LIMIT, FLIGHT_REVIEWS_PAGE_SIZE } from '@/lib/flight-reviews-feed';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!applyRateLimit(request).allowed) return NextResponse.json({ error: 'Patientez un instant avant de réessayer.' }, { status: 429 });
  const url = new URL(request.url);
  const before = url.searchParams.get('before');
  const sentiment = url.searchParams.get('sentiment');
  const search = (url.searchParams.get('q') ?? '').trim().slice(0,80);
  const cursor = before?.split('|');
  if (cursor && (cursor.length !== 2 || !/^\d{4}-\d{2}-\d{2}T[\d:.+Z-]+$/.test(cursor[0]) || !Number.isFinite(Date.parse(cursor[0])) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cursor[1]))) return NextResponse.json({ error: 'Date invalide.' }, { status: 400 });
  const supabase = await createClient();
  let query = supabase.from('flight_reviews').select('id,author_label,body,sentiment,rating,simulation,created_at')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(FLIGHT_REVIEWS_PAGE_SIZE + 1);
  if (cursor) query = query.or(`created_at.lt.${cursor[0]},and(created_at.eq.${cursor[0]},id.lt.${cursor[1]})`);
  if (sentiment && ['positif','mitige','negatif'].includes(sentiment)) query = query.eq('sentiment', sentiment);
  if (search) query = query.ilike('body', `%${search.replace(/[\\%_]/g,'\\$&')}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Le fil des avis est temporairement indisponible.' }, { status: 503 });
  const rows = data ?? [];
  const last = rows[FLIGHT_REVIEWS_PAGE_SIZE - 1];
  return NextResponse.json({ reviews: rows.slice(0,FLIGHT_REVIEWS_PAGE_SIZE), next: rows.length>FLIGHT_REVIEWS_PAGE_SIZE ? `${last.created_at}|${last.id}` : null, feed_limit: FLIGHT_REVIEWS_FEED_LIMIT }, { headers: { 'Cache-Control': 'no-store' } });
}
