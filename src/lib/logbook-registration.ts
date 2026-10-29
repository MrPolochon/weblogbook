import type { createAdminClient } from '@/lib/supabase/admin';

export type UnrecordedClosedPlan = {
  id: string;
  numero_vol: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  temps_prev_min: number;
  accepted_at: string;
  cloture_at: string;
  available_count: number | string;
};

/** All logbook statuses count as registered; legacy records are matched in SQL. */
export async function loadUnrecordedClosedPlans(
  admin: ReturnType<typeof createAdminClient>,
  pilotId: string,
  limit = 50,
) {
  const { data, error } = await admin.rpc('get_unrecorded_closed_plans', {
    p_pilot: pilotId,
    p_limit: limit,
  });
  if (error) return { data: [] as UnrecordedClosedPlan[], count: null, error };
  if (!Array.isArray(data)) {
    return { data: [] as UnrecordedClosedPlan[], count: null, error: { message: 'Liste des plans indisponible.' } };
  }
  const plans = data as UnrecordedClosedPlan[];
  const count = plans.length ? Number(plans[0].available_count) : 0;
  if (!Number.isSafeInteger(count) || count < plans.length) {
    return { data: [] as UnrecordedClosedPlan[], count: null, error: { message: 'Décompte des plans indisponible.' } };
  }
  return { data: plans, count, error: null };
}
