import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MajorEventsAdmin from './MajorEventsAdmin';
export default async function MajorEventsAdminPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login');
  const { data } = await supabase.from('profiles').select('role').eq('id',user.id).single(); if (data?.role !== 'admin') redirect('/logbook');
  return <MajorEventsAdmin/>;
}
