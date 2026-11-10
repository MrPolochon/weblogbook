/** Virtual F$ loans: fixed interest for the selected term, not an annual rate. */
export const MIN_PRET_PERSONNALISE = 1_000_000;
export const MAX_PRET = 10_000_000;
export const MAX_DUREE_PRET = 90;
export const PRETS_STANDARDS = [200_000, 500_000, 1_000_000, 5_000_000] as const;
export const BAREME_PRETS = [
  { montant: 200_000, taux90Jours: 1.5 }, { montant: 500_000, taux90Jours: 5 },
  { montant: 1_000_000, taux90Jours: 10 }, { montant: 5_000_000, taux90Jours: 20 },
  { montant: 10_000_000, taux90Jours: 30 },
] as const;
export type ModeRemboursement = 'quotidien' | 'echeance';
export type OffrePret = 'standard' | 'personnalise';
export const loanUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never silently reinterpret signs, decimals or scientific notation. */
export function parseMontantPret(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || !/^\s*\d+(?:[\s\u00a0\u202f]\d{3})*\s*$/.test(value)) return null;
  const amount = Number(value.replace(/[\s\u00a0\u202f]/g, ''));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function calculerOffrePret(montant: number, dureeJours: number, offre: OffrePret = 'personnalise') {
  if (!Number.isSafeInteger(montant) || montant > MAX_PRET ||
      (offre === 'standard' ? !PRETS_STANDARDS.some(n => n === montant) : montant < MIN_PRET_PERSONNALISE) ||
      !Number.isInteger(dureeJours) || dureeJours < 1 || dureeJours > MAX_DUREE_PRET) return null;
  let taux90: number = BAREME_PRETS[0].taux90Jours;
  for (let i = 1; i < BAREME_PRETS.length; i++) {
    const lower = BAREME_PRETS[i - 1], upper = BAREME_PRETS[i];
    if (montant <= upper.montant) {
      taux90 = lower.taux90Jours + Math.max(0, montant - lower.montant) *
        (upper.taux90Jours - lower.taux90Jours) / (upper.montant - lower.montant);
      break;
    }
  }
  const points = Math.round(taux90 * dureeJours / 90 * 100 + 1e-9);
  const interets = Math.round(montant * points / 10_000);
  const total = montant + interets;
  return { montant, dureeJours, tauxInteret: points / 100, interets, total,
    quotidienMin: Math.floor(total / dureeJours), quotidienMax: Math.ceil(total / dureeJours) };
}

export type PretBancaire = {
  id: string; montant_emprunte: number; taux_interet: number; montant_total_du: number;
  montant_rembourse: number; statut: string; created_at: string; rembourse_at: string | null;
  echeance_at: string | null; mode_remboursement: ModeRemboursement | 'vols'; duree_jours: number | null;
};

/** Cumulative targets distribute rounding exactly and absorb early repayments. */
export function echeancierPret(pret: PretBancaire, now = Date.now()) {
  const total = Number(pret.montant_total_du), paid = Number(pret.montant_rembourse);
  const remaining = Math.max(0, total - paid), start = new Date(pret.created_at).getTime();
  const end = pret.echeance_at ? new Date(pret.echeance_at).getTime() : Infinity;
  const days = pret.duree_jours ?? 0;
  const elapsed = Math.max(0, Math.min(days, Math.floor((now - start) / 86_400_000)));
  const target = now >= end ? total : pret.mode_remboursement === 'quotidien' && days > 0
    ? Math.round(total * elapsed / days) : 0;
  let next: { date: string; montant: number } | null = null;
  if (pret.mode_remboursement === 'quotidien' && days > 0 && remaining > 0) {
    for (let day = 1; day <= days; day++) {
      const due = Math.round(total * day / days) - paid;
      if (due > 0) { next = { date: new Date(start + day * 86_400_000).toISOString(), montant: due }; break; }
    }
  } else if (Number.isFinite(end) && remaining > 0) next = { date: new Date(end).toISOString(), montant: remaining };
  return { reste: remaining, exigible: Math.max(0, target - paid), prochaine: next };
}
