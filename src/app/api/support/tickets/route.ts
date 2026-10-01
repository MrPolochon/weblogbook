export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin requis' }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('support_tickets')
    .select('id, short_id, discord_username, motif, statut, reason_text, closed_at, closed_by, created_at, transcript, transcript_token')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const table = 'support_ticket_update_resets';
  const counts = await Promise.all([
    admin.from(table).select('ticket_id', { count: 'exact', head: true }),
    admin.from(table).select('ticket_id', { count: 'exact', head: true }).not('completed_at', 'is', null),
    admin.from(table).select('ticket_id', { count: 'exact', head: true }).eq('dm_status', 'unavailable'),
    admin.from(table).select('ticket_id', { count: 'exact', head: true }).is('completed_at', null).not('last_error', 'is', null),
  ]);
  const resetError = counts.find((r) => r.error)?.error;
  const updateReset = resetError
    ? { status: ['42P01', 'PGRST205'].includes(resetError.code) ? 'migration_required' : 'unavailable' }
    : {
      status: 'ready', total: counts[0].count ?? 0, completed: counts[1].count ?? 0,
      dm_unavailable: counts[2].count ?? 0, retrying: counts[3].count ?? 0,
    };
  return NextResponse.json({ tickets: data ?? [], update_reset: updateReset });
}
