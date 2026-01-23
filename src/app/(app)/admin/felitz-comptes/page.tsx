import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminFelitzComptesContent from './AdminFelitzComptesContent';

export default async function AdminFelitzComptesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  // Récupérer tous les comptes (admin uniquement)
  const admin = createAdminClient();
  const { data: comptes } = await admin
    .from('felitz_comptes')
    .select('id, user_id, compagnie_id, vban, solde, created_at, compagnies(nom), profiles(identifiant)')
    .order('created_at', { ascending: false });

  // Récupérer tous les utilisateurs et compagnies pour les sélecteurs
  const [{ data: users }, { data: compagnies }] = await Promise.all([
    supabase.from('profiles').select('id, identifiant').order('identifiant'),
    supabase.from('compagnies').select('id, nom').order('nom'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Gestion des comptes Felitz Bank</h1>
      </div>
      <AdminFelitzComptesContent
        comptes={comptes || []}
        users={users || []}
        compagnies={compagnies || []}
      />
    </div>
  );
}
