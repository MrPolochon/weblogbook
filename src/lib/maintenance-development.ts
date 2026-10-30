import type { SupabaseClient } from '@supabase/supabase-js';

export async function maintenanceDevelopmentEffects(admin: SupabaseClient, company: string, aircraft: string) {
  const { data, error } = await admin.rpc('company_development_effects', { p_company: company, p_aircraft: aircraft });
  if (error) throw new Error('Les conditions de maintenance sont temporairement indisponibles.');
  return {
    inspectionRequired: data?.inspection_required === true,
    priceFactor: 1 + Math.max(-80, Math.min(300, Number(data?.repair_percent) || 0)) / 100,
    delayFactor: 1 + Math.max(-80, Math.min(300, Number(data?.repair_delay_percent) || 0)) / 100,
  };
}
