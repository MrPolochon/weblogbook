import { createAdminClient } from '@/lib/supabase/admin';

type TxRow = { libelle?: string | null; [k: string]: unknown };

export async function enrichTransactionsWithVban<T extends TxRow>(
  admin: ReturnType<typeof createAdminClient>,
  raw: T[]
): Promise<T[]> {
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const toResolve = new Set<string>();
  raw.forEach((t) => {
    (t.libelle || '').match(UUID_REGEX)?.forEach((u) => toResolve.add(u));
  });
  if (toResolve.size === 0) return raw;

  const ids = Array.from(toResolve);
  const cols = ['compagnie_id', 'proprietaire_id', 'alliance_id', 'entreprise_reparation_id'] as const;

  const [byIdRes, ...byColsRes] = await Promise.all([
    admin.from('felitz_comptes').select('id, vban').in('id', ids),
    ...cols.map((col) => admin.from('felitz_comptes').select(`${col}, vban`).in(col, ids)),
  ]);

  const vbanByUuid: Record<string, string> = {};
  (byIdRes.data || []).forEach((r: Record<string, string>) => { if (r.id) vbanByUuid[r.id] = r.vban; });
  byColsRes.forEach((res, idx) => {
    const col = cols[idx];
    (res.data || []).forEach((r: Record<string, string>) => {
      if (r[col]) vbanByUuid[r[col]] = r.vban;
    });
  });

  return raw.map((t) => {
    let libelle = t.libelle || '';
    for (const [uuid, vban] of Object.entries(vbanByUuid)) {
      const escaped = uuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      libelle = libelle.replace(new RegExp(escaped, 'gi'), vban);
    }
    return { ...t, libelle };
  });
}
