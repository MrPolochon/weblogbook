import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cible du retour (hub enregistré à la demande, sinon hub principal, sinon un hub de la compagnie).
 */
export async function resolveAeroportBaseRetour(
  admin: SupabaseClient,
  dem: { compagnie_id: string; aeroport_depart_client: string | null }
): Promise<string | null> {
  if (dem.aeroport_depart_client && String(dem.aeroport_depart_client).trim()) {
    return String(dem.aeroport_depart_client).trim().toUpperCase();
  }
  const { data: principal } = await admin
    .from('compagnie_hubs')
    .select('aeroport_code')
    .eq('compagnie_id', dem.compagnie_id)
    .eq('est_hub_principal', true)
    .limit(1)
    .maybeSingle();
  if (principal?.aeroport_code) return String(principal.aeroport_code).toUpperCase();
  const { data: anyHub } = await admin
    .from('compagnie_hubs')
    .select('aeroport_code')
    .eq('compagnie_id', dem.compagnie_id)
    .limit(1)
    .maybeSingle();
  if (anyHub?.aeroport_code) return String(anyHub.aeroport_code).toUpperCase();
  return null;
}

/**
 * Après clôture d'un vol ferry : si une demande est en `retour_transit` et l'arrivée = base, finalise la demande.
 */
export async function completeReparationReturnFerry(
  admin: SupabaseClient,
  avionId: string,
  aeroportArrivee: string
): Promise<void> {
  const aa = String(aeroportArrivee || '').trim().toUpperCase();
  if (!aa) return;

  const { data: d } = await admin
    .from('reparation_demandes')
    .select('id, compagnie_id, statut, aeroport_depart_client')
    .eq('avion_id', avionId)
    .eq('statut', 'retour_transit')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!d) return;

  const cible = await resolveAeroportBaseRetour(admin, d);
  if (!cible || cible !== aa) return;

  await admin
    .from('reparation_demandes')
    .update({
      statut: 'completee',
      completee_at: new Date().toISOString(),
      retour_transit_eta_at: null,
    })
    .eq('id', d.id);
  await admin
    .from('compagnie_avions')
    .update({ statut: 'disponible' })
    .eq('id', avionId);
}

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
