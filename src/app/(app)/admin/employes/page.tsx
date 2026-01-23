import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, UserPlus } from 'lucide-react';
import Link from 'next/link';
import AdminEmployesClient from './AdminEmployesClient';

export default async function AdminEmployesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();

  // Liste des compagnies
  const { data: compagnies } = await admin.from('compagnies')
    .select('id, nom, pdg_id, profiles!compagnies_pdg_id_fkey(identifiant)')
    .order('nom');

  // Liste des pilotes (non employés ou à réassigner)
  const { data: pilotes } = await admin.from('profiles')
    .select('id, identifiant')
    .in('role', ['pilote', 'admin'])
    .order('identifiant');

  // Liste des employés actuels
  const { data: employes } = await admin.from('compagnie_employes')
    .select('*, profiles(id, identifiant), compagnies(id, nom)')
    .order('date_embauche', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <UserPlus className="h-7 w-7 text-sky-400" />
          Gestion des employés
        </h1>
      </div>

      <AdminEmployesClient 
        compagnies={compagnies || []}
        pilotes={pilotes || []}
        employes={employes || []}
      />
    </div>
  );
}
