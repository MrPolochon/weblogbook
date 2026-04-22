/** Évite les doublons (même compagnie_id) tout en gardant l’ordre d’origine des lignes conservées. */
export function dedupeAllianceMembresByCompagnie<
  T extends { id: string; compagnie_id: string; role: string },
>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const rank: Record<string, number> = { president: 0, vice_president: 1, secretaire: 2, membre: 3 };
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
