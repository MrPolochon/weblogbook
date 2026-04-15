import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RadarClient from './RadarClient';

export default async function RadarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <RadarClient userId={user.id} />;
}
