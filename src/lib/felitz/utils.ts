import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;
type TxRow = { libelle?: string | null; [k: string]: unknown };

const FELITZ_PAGE_SIZE = 1000;

/** Charge toutes les transactions d'un compte (pagination interne PostgREST). */
export async function fetchAllFelitzTransactions(
  admin: AdminClient,
  compteId: string,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin
      .from('felitz_transactions')
      .select('*')
      .eq('compte_id', compteId)
      .order('created_at', { ascending: false })
      .range(offset, offset + FELITZ_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    all.push(...data);
    if (data.length < FELITZ_PAGE_SIZE) break;
    offset += FELITZ_PAGE_SIZE;
  }

  return all;
}

/** Charge tout l'historique des virements émis depuis un compte (ou par auteur). */
export async function fetchAllFelitzVirements(
  admin: AdminClient,
  filters: { compteSourceId?: string; createdBy?: string },
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    let query = admin
      .from('felitz_virements')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + FELITZ_PAGE_SIZE - 1);

    if (filters.compteSourceId) {
      query = query.eq('compte_source_id', filters.compteSourceId);
    } else if (filters.createdBy) {
      query = query.eq('created_by', filters.createdBy);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    all.push(...data);
    if (data.length < FELITZ_PAGE_SIZE) break;
    offset += FELITZ_PAGE_SIZE;
  }

  return all;
}

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
