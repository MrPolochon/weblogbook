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
  const { data: medevacPlans, error: plansError } = await admin
    .from('plans_vol')
    .select('id, medevac_mission_id')
    .eq('pilote_id', userId)
    .eq('statut', 'cloture')
    .not('siavi_avion_id', 'is', null)
    .is('medevac_next_plan_id', null)
    .order('cloture_at', { ascending: false })
    ;

  if (plansError) throw new Error('Impossible de vérifier les rapports MEDEVAC.');
  if (!medevacPlans || medevacPlans.length === 0) return null;

  const missionIds=[...new Set(medevacPlans.map(p=>p.medevac_mission_id).filter(Boolean))];
  const {data:missionPlans,error:missionError}=missionIds.length?await admin.from('plans_vol').select('id,medevac_mission_id').in('medevac_mission_id',missionIds):{data:[],error:null};
  if(missionError) throw new Error('Impossible de vérifier les missions MEDEVAC.');
  const planIds=[...new Set([...medevacPlans,...(missionPlans??[])].map(p=>p.id))];
  const {data:reports,error:reportsError}=await admin.from('siavi_rapports_medevac').select('plan_vol_id').in('plan_vol_id',planIds);
  if(reportsError) throw new Error('Impossible de vérifier les rapports enregistrés.');
  const reportedIds=new Set((reports??[]).map(r=>r.plan_vol_id));
  const reportedMissions=new Set((missionPlans??[]).filter(p=>reportedIds.has(p.id)).map(p=>p.medevac_mission_id));
  return medevacPlans.find(p=>!reportedIds.has(p.id)&&!reportedMissions.has(p.medevac_mission_id))?.id??null;
}
