import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ReparationClient from './ReparationClient';

export default async function ReparationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  return <ReparationClient userId={user.id} isAdmin={isAdmin} />;
}
