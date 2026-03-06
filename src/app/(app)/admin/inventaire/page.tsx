import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Package } from 'lucide-react';
import AdminInventaireClient from './AdminInventaireClient';

export default async function AdminInventairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, identifiant')
    .order('identifiant');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
        <Package className="h-8 w-8 text-orange-400" />
        Inventaires (tous les pilotes)
      </h1>
      <p className="text-slate-400 text-sm">
        Sélectionnez un pilote pour afficher son inventaire personnel d&apos;avions.
      </p>
      <AdminInventaireClient profiles={profiles ?? []} />
    </div>
  );
}
