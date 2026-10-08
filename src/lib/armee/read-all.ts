/** Lecture paginée : ne jamais calculer un compteur à partir d'une réponse tronquée. */
export async function readAllMilitaryRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw new Error('Impossible de charger les données Armée. Réessayez.');
    rows.push(...(data || []));
    if (!data?.length || data.length < size) return rows;
  }
}
