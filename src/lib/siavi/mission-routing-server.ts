import { createAdminClient } from '@/lib/supabase/admin';
import { medevacRoutingError } from './mission-routing';

export async function validateMedevacItineraryChange(
  admin: ReturnType<typeof createAdminClient>, id: string,
  patch: { aeroport_depart?: string; aeroport_arrivee: string }, moveNextDeparture = false,
): Promise<string | null> {
  const { data: plan, error } = await admin.from('plans_vol').select('id,siavi_avion_id,medevac_mission_id,medevac_mission_type,medevac_next_plan_id,aeroport_depart,aeroport_arrivee').eq('id', id).single();
  if (error || !plan) throw new Error('Vérification de mission indisponible');
  if (!plan.siavi_avion_id) return null;
  const [mission, bases] = await Promise.all([
    plan.medevac_mission_id
      ? admin.from('plans_vol').select('id,aeroport_depart,aeroport_arrivee').eq('medevac_mission_id', plan.medevac_mission_id).order('medevac_segment_index')
      : Promise.resolve({ data: [plan], error: null }),
    admin.from('siavi_hubs').select('aeroport_oaci'),
  ]);
  if (mission.error || bases.error) throw new Error('Vérification des bases et trajets indisponible');
  const legs = (mission.data ?? []).map(p => p.id === id ? { ...p, ...patch } : moveNextDeparture && p.id === plan.medevac_next_plan_id ? { ...p, aeroport_depart: patch.aeroport_arrivee } : p);
  return medevacRoutingError(plan.medevac_mission_type === 'service' ? 'service' : 'evacuation', legs, (bases.data ?? []).map(b => b.aeroport_oaci));
}
