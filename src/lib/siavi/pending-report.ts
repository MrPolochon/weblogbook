import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Checks if a user has a closed MEDEVAC flight without a filed report.
 * Returns the plan_vol_id if a pending report exists, null otherwise.
 */
export async function getPendingMedevacReport(
  admin: AdminClient,
  userId: string
): Promise<string | null> {
  // Ne considérer que le segment final d'une mission (ou un vol sans segment suivant) :
  // après reprise d'un segment suivant, le segment précédent passe en « cloture » mais garde
  // medevac_next_plan_id → ne pas forcer le rapport tant que la mission n'est pas terminée.
  const { data: medevacPlans } = await admin
    .from('plans_vol')
    .select('id')
    .eq('pilote_id', userId)
    .eq('statut', 'cloture')
    .not('siavi_avion_id', 'is', null)
    .is('medevac_next_plan_id', null)
    .order('cloture_at', { ascending: false })
    .limit(10);

  if (!medevacPlans || medevacPlans.length === 0) return null;

  const planIds = medevacPlans.map(p => p.id);

  const { data: existingReports } = await admin
    .from('siavi_rapports_medevac')
    .select('plan_vol_id')
    .in('plan_vol_id', planIds);

  const reportedIds = new Set((existingReports || []).map(r => r.plan_vol_id));
  const pending = medevacPlans.find(p => !reportedIds.has(p.id));

  return pending?.id || null;
}
