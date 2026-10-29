export interface DisplayFlightQuote {
  quote_id: string;
  expires_at: string;
  nb_pax_genere: number;
  cargo_kg_genere: number;
  revenue_brut: number;
  salaire_pilote: number;
  prix_billet_utilise: number;
  prix_kg_cargo_utilise: number;
  type_cargaison: string | null;
  type_cargaison_libelle: string | null;
}

/** A suggestion is only applied until the pilot edits the full callsign. */
export function suggestedPilotCallsign(commercial: boolean, companyCode?: string | null, registration?: string | null): string {
  return (commercial ? companyCode : registration)?.trim().toUpperCase() ?? '';
}

export function applyCallsignSuggestion(current: string, suggestion: string, manuallyEdited: boolean): string {
  return manuallyEdited ? current : suggestion;
}

/** Reject incomplete responses rather than displaying invented financial amounts. */
export function readDisplayFlightQuote(value: unknown, now = Date.now()): DisplayFlightQuote {
  const q = value as Partial<DisplayFlightQuote> | null;
  const amounts = ['nb_pax_genere', 'cargo_kg_genere', 'revenue_brut', 'salaire_pilote', 'prix_billet_utilise', 'prix_kg_cargo_utilise'] as const;
  if (!q || typeof q.quote_id !== 'string' || !q.quote_id || typeof q.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(q.expires_at)) || Date.parse(q.expires_at) <= now ||
      amounts.some(k => typeof q[k] !== 'number' || !Number.isFinite(q[k]) || q[k]! < 0)) {
    throw new Error('Le chargement du vol est incomplet ou expiré. Actualisez-le avant le dépôt.');
  }
  if ((q.type_cargaison != null && typeof q.type_cargaison !== 'string') ||
      (q.type_cargaison_libelle != null && typeof q.type_cargaison_libelle !== 'string')) {
    throw new Error('La cargaison du vol est invalide. Actualisez le chargement.');
  }
  return q as DisplayFlightQuote;
}
