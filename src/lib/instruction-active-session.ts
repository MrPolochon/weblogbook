import type { SupabaseClient } from '@supabase/supabase-js';

export type ActiveInstructionSessionKind = 'exam' | 'pilot_training';

export type ActiveInstructionSession = {
  kind: ActiveInstructionSessionKind;
  id: string;
  licence_code: string;
  counterpart_id: string;
  counterpart_identifiant: string | null;
  updated_at: string;
};

function resolveIdentifiant(rel: unknown): string | null {
  if (rel && typeof rel === 'object' && !Array.isArray(rel) && 'identifiant' in rel) {
    return String((rel as { identifiant: string }).identifiant);
  }
  if (Array.isArray(rel) && rel[0] && typeof rel[0] === 'object' && 'identifiant' in rel[0]) {
    return String((rel[0] as { identifiant: string }).identifiant);
  }
  return null;
}

/** Session `en_cours` dont l'utilisateur est l'instructeur / examinateur assigné. */
export async function getActiveInstructionSessionForAssignee(
  admin: SupabaseClient,
  userId: string,
): Promise<ActiveInstructionSession | null> {
  const [examResult, pilotResult] = await Promise.all([
    admin
      .from('instruction_exam_requests')
      .select(
        'id, licence_code, requester_id, updated_at, requester:profiles!instruction_exam_requests_requester_id_fkey(identifiant)',
      )
      .eq('instructeur_id', userId)
      .eq('statut', 'en_cours')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('instruction_pilot_training_requests')
      .select('id, licence_code, requester_id, updated_at')
      .eq('assignee_id', userId)
      .eq('statut', 'en_cours')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const candidates: ActiveInstructionSession[] = [];

  if (examResult.data) {
    const row = examResult.data;
    candidates.push({
      kind: 'exam',
      id: row.id as string,
      licence_code: row.licence_code as string,
      counterpart_id: row.requester_id as string,
      counterpart_identifiant: resolveIdentifiant(row.requester),
      updated_at: row.updated_at as string,
    });
  }

  if (pilotResult.data) {
    const row = pilotResult.data;
    let counterpartIdent: string | null = null;
    if (row.requester_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('identifiant')
        .eq('id', row.requester_id as string)
        .maybeSingle();
      counterpartIdent = (profile?.identifiant as string | undefined) ?? null;
    }
    candidates.push({
      kind: 'pilot_training',
      id: row.id as string,
      licence_code: (row.licence_code as string) || '—',
      counterpart_id: row.requester_id as string,
      counterpart_identifiant: counterpartIdent,
      updated_at: row.updated_at as string,
    });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  return candidates.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0]!;
}
