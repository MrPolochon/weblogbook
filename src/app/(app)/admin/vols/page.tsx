import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import VolsEnAttente from './VolsEnAttente';
import AddVolAdminForm from './AddVolAdminForm';

export default async function AdminVolsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();
  const [{ data: vols }, { data: types }, { data: compagnies }, { data: profiles }] = await Promise.all([
    admin.from('vols').select(`
      id, duree_minutes, depart_utc, statut, compagnie_libelle, type_vol, role_pilote, refusal_reason,
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      type_avion:types_avion(nom)
    `).eq('statut', 'en_attente').order('created_at', { ascending: true }),
    admin.from('types_avion').select('id, nom, constructeur').order('ordre'),
    admin.from('compagnies').select('id, nom').order('nom'),
    admin.from('profiles').select('id, identifiant').order('identifiant'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Vols en attente</h1>
      </div>

      <AddVolAdminForm
        typesAvion={types || []}
        compagnies={compagnies || []}
        profiles={profiles || []}
      />

      <VolsEnAttente vols={vols || []} />
    </div>
  );
}
