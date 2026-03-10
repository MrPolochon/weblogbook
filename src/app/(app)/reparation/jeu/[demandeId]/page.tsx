import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MiniJeuxClient from './MiniJeuxClient';

export default async function MiniJeuxPage({ params }: { params: Promise<{ demandeId: string }> }) {
  const { demandeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <MiniJeuxClient demandeId={demandeId} userId={user.id} />;
}
