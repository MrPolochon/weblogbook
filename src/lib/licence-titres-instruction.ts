import type { SupabaseClient } from '@supabase/supabase-js';

/** Titres « instruction / examen » — délivrance réservée aux admins et aux détenteurs FE / ATC FE. */
export const INSTRUCTION_TITRE_TYPES = ['FI', 'FE', 'ATC FI', 'ATC FE'] as const;

export function isInstructionTitreType(type: string | null | undefined): boolean {
  if (!type) return false;
  return (INSTRUCTION_TITRE_TYPES as readonly string[]).includes(type);
}

/**
 * Peut délivrer (POST) ce type de titre ?
 * - admin : oui
 * - IFSA (sans être admin) : non pour ces types
 * - FI ou FE (vol) : oui si le donneur a la licence **FE**
 * - ATC FI / ATC FE : oui si le donneur a la licence **ATC FE**
 */
export async function canGrantInstructionTitreType(
  admin: SupabaseClient,
  grantorId: string,
  grantorRole: string | null | undefined,
  grantorIfsa: boolean | undefined,
  type: string,
): Promise<boolean> {
  if (grantorRole === 'admin') return true;
  if (!isInstructionTitreType(type)) return true;
  if (grantorIfsa) return false;

  if (type === 'FI' || type === 'FE') {
    const { data } = await admin
      .from('licences_qualifications')
      .select('id')
      .eq('user_id', grantorId)
      .eq('type', 'FE')
      .limit(1);
    return (data?.length ?? 0) > 0;
  }
  if (type === 'ATC FI' || type === 'ATC FE') {
    const { data } = await admin
      .from('licences_qualifications')
      .select('id')
      .eq('user_id', grantorId)
      .eq('type', 'ATC FE')
      .limit(1);
    return (data?.length ?? 0) > 0;
  }
  return false;
}
