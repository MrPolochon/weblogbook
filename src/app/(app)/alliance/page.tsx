import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AllianceClient from './AllianceClient';

export default async function AlliancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const compagnieIds: string[] = [];
  const { data: pdgRows } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  (pdgRows || []).forEach((r) => compagnieIds.push(r.id));
  const { data: empRows } = await admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', user.id);
  (empRows || []).forEach((r) => { if (r.compagnie_id && !compagnieIds.includes(r.compagnie_id)) compagnieIds.push(r.compagnie_id); });

  const compagniesSansAlliance: { id: string; nom: string }[] = [];
  if (compagnieIds.length > 0) {
    const { data: comps } = await admin.from('compagnies').select('id, nom, alliance_id').in('id', compagnieIds);
    (comps || []).forEach((c) => { const row = c as { id: string; nom: string; alliance_id?: string | null }; if (!row.alliance_id) compagniesSansAlliance.push({ id: row.id, nom: row.nom }); });
  }

  const pdgCompagnieIds = (pdgRows || []).map((r) => r.id);

  return (
    <AllianceClient
      compagniesSansAlliance={compagniesSansAlliance}
      pdgCompagnieIds={pdgCompagnieIds}
    />
  );
}
