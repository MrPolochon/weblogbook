/**
 * Clés JSON des réponses pour les blocs `question_module`.
 * Le préfixe `module_{moduleId}_` seul provoquait des collisions dès qu’un même
 * module était utilisé deux fois dans le formulaire (écrasement, mauvais
 * intitulé associé à une réponse, score incohérent). On privilégie
 * `module_{blockQuestionId}_` (id de la question « bloc module » dans le JSON).
 */
export function formatModuleAnswerKey(
  blockQuestionId: string | undefined,
  moduleId: string | undefined,
  moduleQuestionId: string
): string {
  if (blockQuestionId) {
    return `module_${blockQuestionId}_${moduleQuestionId}`;
  }
  if (moduleId?.trim()) {
    return `module_${moduleId.trim()}_${moduleQuestionId}`;
  }
  return `module__${moduleQuestionId}`;
}

export function getModuleQuestionIdFromKey(
  key: string,
  q: { id?: string; module_id?: string }
): string {
  if (q.id) {
    const p = `module_${q.id}_`;
    if (key.startsWith(p)) return key.slice(p.length);
  }
  const mid = q.module_id?.trim();
  if (mid) {
    const p = `module_${mid}_`;
    if (key.startsWith(p)) return key.slice(p.length);
  }
  return key;
}

export function getModuleAnswerEntries(
  q: { id?: string; module_id?: string },
  answers: Record<string, unknown>
): [string, unknown][] {
  const entries = Object.entries(answers) as [string, unknown][];
  if (q.id) {
    const p = `module_${q.id}_`;
    const m = entries.filter(([k]) => k.startsWith(p));
    if (m.length > 0) return m;
  }
  const mid = q.module_id?.trim();
  if (mid) {
    const p = `module_${mid}_`;
    return entries.filter(([k]) => k.startsWith(p));
  }
  return [];
}
