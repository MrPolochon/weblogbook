/** Fisher–Yates: stable after generation, without the bias of sort(random). */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function wingCellVisible(index: number, columns = 22, rows = 5): boolean {
  return index % columns < Math.round(columns - Math.floor(index / columns) * (columns / rows) * 0.3);
}

export function boardingDistribution(count: number) {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const vip = Math.min(total, 2, Math.max(1, Math.floor(total * 0.05)));
  const business = Math.min(total - vip, Math.max(1, Math.floor(total * 0.1)));
  const premium = Math.min(total - vip - business, Math.max(1, Math.floor(total * 0.2)));
  return { vip, business, premium, economy: total - vip - business - premium };
}
