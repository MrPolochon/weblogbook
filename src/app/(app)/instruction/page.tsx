import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import InstructionClient from './InstructionClient';

export default async function InstructionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'instructeur' && me?.role !== 'admin') redirect('/logbook');

  const [{ data: eleves }, { data: typesAvion }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, identifiant, formation_instruction_active, created_at')
      .eq('instructeur_referent_id', user.id)
      .order('created_at', { ascending: false }),
    admin
      .from('types_avion')
      .select('id, nom, constructeur, code_oaci')
      .order('ordre', { ascending: true }),
  ]);

  const eleveIds = (eleves || []).map((e) => e.id);
  const { data: avionsTemp } = eleveIds.length > 0
    ? await admin
        .from('inventaire_avions')
        .select('id, proprietaire_id, type_avion_id, nom_personnalise, immatriculation, aeroport_actuel, statut, usure_percent, instruction_actif')
        .eq('instruction_actif', true)
        .eq('instruction_instructeur_id', user.id)
        .in('proprietaire_id', eleveIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  return (
    <InstructionClient
      eleves={(eleves || []) as Array<{ id: string; identifiant: string; formation_instruction_active: boolean; created_at: string }>}
      typesAvion={(typesAvion || []) as Array<{ id: string; nom: string; constructeur: string | null; code_oaci: string | null }>}
      avionsTemp={(avionsTemp || []) as Array<{ id: string; proprietaire_id: string; type_avion_id: string; nom_personnalise: string | null; immatriculation: string | null; aeroport_actuel: string | null; statut: string | null; usure_percent: number | null; instruction_actif: boolean }>}
    />
  );
}
