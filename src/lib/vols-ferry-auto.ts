import type { SupabaseClient } from '@supabase/supabase-js';
import {
  advanceReparationIfFerryArrivedAtHangar,
  completeReparationReturnFerry,
} from '@/lib/reparation-after-ferry';

/**
 * Clôture les vols ferry automatiques dont fin_prevue_at est dépassée.
 * Indépendant du trafic utilisateur (à appeler depuis un cron).
 */
export async function completeDueAutoFerryFlights(
  admin: SupabaseClient,
): Promise<{ completed: number; errors: number }> {
  const maintenant = new Date().toISOString();
  const { data: volsACompleter, error } = await admin
    .from('vols_ferry')
    .select('id, avion_id, aeroport_arrivee')
    .eq('automatique', true)
    .in('statut', ['planned', 'in_progress'])
    .not('fin_prevue_at', 'is', null)
    .lt('fin_prevue_at', maintenant);

  if (error) {
    console.error('[ferry-auto] lecture:', error.message);
    return { completed: 0, errors: 1 };
  }

  let completed = 0;
  let errors = 0;

  for (const vol of volsACompleter ?? []) {
    try {
      const { error: volErr } = await admin
        .from('vols_ferry')
        .update({ statut: 'completed', completed_at: maintenant })
        .eq('id', vol.id)
        .in('statut', ['planned', 'in_progress']);
      if (volErr) throw volErr;

      const { data: avion } = await admin
        .from('compagnie_avions')
        .select('usure_percent')
        .eq('id', vol.avion_id)
        .single();

      if (avion) {
        const nouvelleUsure = Math.max(0, avion.usure_percent - 5);
        const nouveauStatut = nouvelleUsure === 0 ? 'bloque' : 'ground';
        await admin
          .from('compagnie_avions')
          .update({
            aeroport_actuel: vol.aeroport_arrivee,
            usure_percent: nouvelleUsure,
            statut: nouveauStatut,
          })
          .eq('id', vol.avion_id);

        await advanceReparationIfFerryArrivedAtHangar(admin, vol.avion_id, vol.aeroport_arrivee);
        await completeReparationReturnFerry(admin, vol.avion_id, vol.aeroport_arrivee);
      }
      completed += 1;
    } catch (e) {
      errors += 1;
      console.error('[ferry-auto] vol', vol.id, e);
    }
  }

  return { completed, errors };
}
