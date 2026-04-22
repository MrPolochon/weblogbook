const ALLIANCE_ROLE_RANK: Record<string, number> = { president: 0, vice_president: 1, secretaire: 2, membre: 3 };

/** Ligne « principale » quand l’utilisateur dirige plusieurs compagnies dans la même alliance (évite myMembers[0] arbitraire). */
export function pickHighestAllianceRoleMembership<T extends { role: string; compagnie_id: string }>(
  rows: T[] | null | undefined,
): T | null {
  if (!rows?.length) return null;
  return [...rows].sort(
    (a, b) => (ALLIANCE_ROLE_RANK[a.role] ?? 99) - (ALLIANCE_ROLE_RANK[b.role] ?? 99),
  )[0];
}

export function findPresidentMembership<T extends { role: string; compagnie_id: string }>(
  rows: T[] | null | undefined,
): T | null {
  return rows?.find(m => m.role === 'president') ?? null;
}

/** Évite les doublons (même compagnie_id) tout en gardant l’ordre d’origine des lignes conservées. */
export function dedupeAllianceMembresByCompagnie<
  T extends { id: string; compagnie_id: string; role: string },
>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const rank = ALLIANCE_ROLE_RANK;
  const byComp = new Map<string, T>();
  for (const row of rows) {
    const prev = byComp.get(row.compagnie_id);
    if (!prev) {
      byComp.set(row.compagnie_id, row);
      continue;
    }
    const pr = rank[prev.role] ?? 99;
    const nr = rank[row.role] ?? 99;
    if (nr < pr || (nr === pr && row.id < prev.id)) byComp.set(row.compagnie_id, row);
  }
  const chosenIds = new Set(Array.from(byComp.values(), r => r.id));
  return rows.filter(r => chosenIds.has(r.id));
}
