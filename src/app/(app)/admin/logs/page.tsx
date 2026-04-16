import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import LogsClient from './LogsClient';

export const dynamic = 'force-dynamic';

export default async function AdminLogsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();

  const { data: logs } = await admin
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const { data: actionTypes } = await admin
    .from('activity_logs')
    .select('action')
    .limit(1000);

  const uniqueActions = [...new Set((actionTypes || []).map(a => a.action))].sort();

  return <LogsClient logs={logs || []} actionTypes={uniqueActions} />;
}
