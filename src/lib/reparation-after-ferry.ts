import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Si un ferry se termine à l'aéroport du hangar d'une demande encore « acceptee »,
 * passe la demande et l'avion en réparation effective (même logique que PATCH vols-ferry).
 */
export async function advanceReparationIfFerryArrivedAtHangar(
  admin: SupabaseClient,
  avionId: string,
  aeroportArrivee: string
): Promise<void> {
  const aa = String(aeroportArrivee || '').trim().toUpperCase();
  if (!aa) return;

  const { data: pendingRepair } = await admin
    .from('reparation_demandes')
    .select('id, statut, hangar_id, reparation_hangars!inner(aeroport_code)')
    .eq('avion_id', avionId)
    .eq('statut', 'acceptee')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pendingRepair) return;

  const hangarRow = Array.isArray(pendingRepair.reparation_hangars)
    ? pendingRepair.reparation_hangars[0]
    : pendingRepair.reparation_hangars;
  if (hangarRow?.aeroport_code !== aa) return;

  await admin
    .from('reparation_demandes')
    .update({
      statut: 'en_reparation',
      debut_reparation_at: new Date().toISOString(),
    })
    .eq('id', pendingRepair.id);
  await admin.from('compagnie_avions').update({ statut: 'en_reparation' }).eq('id', avionId);
}
