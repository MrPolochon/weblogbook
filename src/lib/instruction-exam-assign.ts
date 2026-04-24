import type { SupabaseClient } from '@supabase/supabase-js';

/** FNV-1a 32 bits — mélange stable pour le départage à charge identique. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Choisit l’examinateur avec la charge la plus faible, comme à la création d’une demande
 * (file : demandes assigne/accepte/en_cours + nombre d’élèves en formation rattachés).
 * À charge **égale**, on ne tranche plus par l’id lexicographique (toujours le même compte) :
 * on utilise `tieBreakKey` (ex. id de la demande) pour répartir entre les ex aequo.
 * Si requesterId est dans le pool (cas rare), il est exclu sauf s’il est seul.
 */
export async function selectExamInstructorByWorkload(
  admin: SupabaseClient,
  pool: string[],
  requesterId: string,
  options?: { simulatedExtraLoad?: Map<string, number>; tieBreakKey?: string },
): Promise<string | null> {
  if (pool.length === 0) return null;
  let eligible = pool.filter((id) => id !== requesterId);
  if (eligible.length === 0) eligible = [...pool];

  const workload = new Map<string, number>();
  for (const id of eligible) workload.set(id, 0);

  const { data: pendingAssigned } = await admin
    .from('instruction_exam_requests')
    .select('instructeur_id')
    .in('instructeur_id', eligible)
    .in('statut', ['assigne', 'accepte', 'en_cours']);
  for (const row of pendingAssigned || []) {
    if (!row.instructeur_id) continue;
    workload.set(row.instructeur_id, (workload.get(row.instructeur_id) || 0) + 1);
  }

  const { data: elevesActifs } = await admin
    .from('profiles')
    .select('instructeur_referent_id')
    .in('instructeur_referent_id', eligible)
    .eq('formation_instruction_active', true);
  for (const row of elevesActifs || []) {
    const ref = row.instructeur_referent_id as string | null;
    if (!ref) continue;
    workload.set(ref, (workload.get(ref) || 0) + 1);
  }

  const extra = options?.simulatedExtraLoad;
  const total = (id: string) => (workload.get(id) || 0) + (extra?.get(id) || 0);
  const tieKey = options?.tieBreakKey ?? requesterId;

  const withLoad = eligible.map((id) => ({ id, w: total(id) }));
  const wMin = Math.min(...withLoad.map((t) => t.w));
  const atMin = withLoad
    .filter((t) => t.w === wMin)
    .map((t) => t.id)
    .sort((a, b) => a.localeCompare(b));

  if (atMin.length === 0) return null;
  if (atMin.length === 1) return atMin[0] ?? null;

  // Plusieurs ex aequo : le plus haut hash(tieKey::id) gagne (varie d’une demande à l’autre)
  let best = atMin[0]!;
  let bestH = 0;
  for (const id of atMin) {
    const h = hash32(`${tieKey}::${id}`);
    if (h > bestH) {
      bestH = h;
      best = id;
    } else if (h === bestH && id.localeCompare(best) < 0) {
      best = id;
    }
  }
  return best;
}
