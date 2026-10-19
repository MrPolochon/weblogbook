export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { featureMissing } from '@/lib/events/server';
export async function GET() {
  const now = Date.now();
  const { data, error } = await createAdminClient().from('major_event_configs')
    .select('airports, event:site_calendar_events!inner(id,title,starts_at,ends_at)')
    .eq('enabled',true).gte('event.ends_at',new Date(now).toISOString()).lte('event.starts_at',new Date(now + 86400000).toISOString()).limit(20);
  if (error && !featureMissing(error)) return NextResponse.json({ error: 'Annonces indisponibles' }, { status: 503 });
  return NextResponse.json({ events: (data || []).map(row => ({ ...row.event, airports: row.airports })) }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } });
}
