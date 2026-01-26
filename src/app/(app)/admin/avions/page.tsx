import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Plane } from 'lucide-react';
import AdminAvionsClient from './AdminAvionsClient';

export default async function AdminAvionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
        <Plane className="h-8 w-8 text-sky-400" />
        Gestion des avions
      </h1>
      <AdminAvionsClient />
    </div>
  );
}
