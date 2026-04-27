import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AllianceClient from './AllianceClient';

export default async function AlliancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const { data: pdgRows } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const { data: empRows } = await admin.from('compagnie_employes').select('compagnie_id, role').eq('pilote_id', user.id);

  // Toutes les compagnies invitables (sans alliance), pas seulement celles de l'utilisateur
  const { data: compsInvitables } = await admin
    .from('compagnies')
    .select('id, nom')
    .is('alliance_id', null)
    .order('nom', { ascending: true });
  const compagniesSansAlliance: { id: string; nom: string }[] = (compsInvitables || []).map((c) => ({
    id: c.id,
    nom: c.nom,
  }));

  const coPdgCompIds = (empRows || []).filter((e) => e.role === 'co_pdg').map((e) => e.compagnie_id);
  const pdgCompagnieIds = [
    ...(pdgRows || []).map((r) => r.id),
    ...coPdgCompIds,
  ];

  return (
    <AllianceClient
      compagniesSansAlliance={compagniesSansAlliance}
      pdgCompagnieIds={pdgCompagnieIds}
      isAdmin={isAdmin}
    />
  );
}
