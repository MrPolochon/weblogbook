import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AdminAlliancesClient from './AdminAlliancesClient';

export default async function AdminAlliancesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  const admin = createAdminClient();
  const { data: alliances } = await admin.from('alliances')
    .select('id, nom, description, devise, created_at, created_by_compagnie_id')
    .order('created_at', { ascending: false });

  const { data: compagnies } = await admin.from('compagnies')
    .select('id, nom, pdg_id, alliance_id')
    .order('nom');

  const { data: membres } = await admin.from('alliance_membres').select('alliance_id, compagnie_id, role');
  const membresByAlliance: Record<string, number> = {};
  (membres || []).forEach(m => { membresByAlliance[m.alliance_id] = (membresByAlliance[m.alliance_id] || 0) + 1; });

  return (
    <AdminAlliancesClient
      alliances={(alliances || []).map(a => ({ ...a, nb_membres: membresByAlliance[a.id] || 0 }))}
      compagnies={(compagnies || []).map(c => ({ id: c.id, nom: c.nom, pdg_id: c.pdg_id, has_alliance: !!c.alliance_id }))}
    />
  );
}
