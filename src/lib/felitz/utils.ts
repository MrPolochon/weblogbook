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
  const flightLabel = /^(Recette vol|Facture carburant \(une seule fois\)|Taxes aéroportuaires .+|Salaire équipage garanti|Salaire commandant|Salaire copilote|Part du bailleur|Revenu location|Contribution alliance|Contribution compagnie|Codeshare alliance|Partage codeshare alliance|Contrat codeshare|Remboursement prêt|Taxes ATC .+|Taxes AFIS|Amende administrative (?:annulation|clôture) forcée) · ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
  const flightMatches = raw.map((t) => (t.libelle || '').match(flightLabel));
  const planIds = Array.from(new Set(flightMatches.flatMap((match) => match ? [match[2].toLowerCase()] : [])));
  const toResolve = new Set<string>();
  raw.forEach((t, index) => {
    if (flightMatches[index]) return;
    (t.libelle || '').match(UUID_REGEX)?.forEach((u) => toResolve.add(u));
  });

  const ids = Array.from(toResolve);
  const cols = ['compagnie_id', 'proprietaire_id', 'alliance_id', 'entreprise_reparation_id'] as const;

  const [plans, accountResults] = await Promise.all([
    Promise.all(Array.from({ length: Math.ceil(planIds.length / 100) }, (_, index) =>
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').in('id', planIds.slice(index * 100, (index + 1) * 100)),
    )),
    ids.length ? Promise.all([
      admin.from('felitz_comptes').select('id, vban').in('id', ids),
      ...cols.map((col) => admin.from('felitz_comptes').select(`${col}, vban`).in(col, ids)),
    ]) : Promise.resolve([]),
  ]);
  const [byIdRes, ...byColsRes] = accountResults;
  const planById = new Map(plans.flatMap(({ data }) => (data ?? []).map((plan) => [plan.id, plan] as const)));

  const vbanByUuid: Record<string, string> = {};
  (byIdRes?.data || []).forEach((r: Record<string, string>) => { if (r.id) vbanByUuid[r.id] = r.vban; });
  byColsRes.forEach((res, idx) => {
    const col = cols[idx];
    (res.data || []).forEach((r: Record<string, string>) => {
      if (r[col]) vbanByUuid[r[col]] = r.vban;
    });
  });

  return raw.map((t, index) => {
    const flight = flightMatches[index];
    if (flight) {
      const plan = planById.get(flight[2].toLowerCase());
      const route = plan?.aeroport_depart && plan.aeroport_arrivee ? `${plan.aeroport_depart} → ${plan.aeroport_arrivee}` : null;
      const reasons: Record<string, string> = {
        'codeshare alliance': 'Revenu de partage de code (alliance)',
        'partage codeshare alliance': 'Part reversée aux partenaires de l’alliance',
        'contrat codeshare': 'Partage de code (contrat)',
        'recette vol': 'Recettes du vol',
        'facture carburant (une seule fois)': 'Facture de carburant',
        'revenu location': 'Revenu de location de l’avion',
      };
      const reason = reasons[flight[1].toLowerCase()] ?? flight[1];
      const libelle = [reason, plan?.numero_vol ? `Vol ${plan.numero_vol}` : null, route].filter(Boolean).join(' · ');
      return { ...t, libelle };
    }
    let libelle = (t.libelle || '').replace(/^Codeshare alliance - Vol /i, 'Revenu de partage de code (alliance) · Vol ');
    for (const [uuid, vban] of Object.entries(vbanByUuid)) {
      const escaped = uuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      libelle = libelle.replace(new RegExp(escaped, 'gi'), vban);
    }
    return { ...t, libelle };
  });
}
