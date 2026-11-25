import type { SupabaseClient } from '@supabase/supabase-js';
import { getOfficialFrequency, hasOfficialAirport, normalizeRadioPosition } from '@/lib/official-vhf';

export async function lookupRadioFrequency(admin: SupabaseClient, aeroport: string, position: string): Promise<string | null> {
  const official = getOfficialFrequency(aeroport, position);
  if (official || hasOfficialAirport(aeroport)) return official;
  const { data, error } = await admin.from('vhf_position_frequencies').select('frequency')
    .eq('aeroport', aeroport.trim().toUpperCase()).eq('position', normalizeRadioPosition(position)).maybeSingle();
  if (error) throw new Error('Annuaire radio indisponible.');
  return data?.frequency ?? null;
}
