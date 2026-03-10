import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ReparationClient from './ReparationClient';

export default async function ReparationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <ReparationClient userId={user.id} />;
}
