import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ReparationClient from './ReparationClient';

export default async function ReparationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" /></div>}>
      <ReparationClient userId={user.id} />
    </Suspense>
  );
}
