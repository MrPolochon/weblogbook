type SanctionState = { type_sanction: string; actif: boolean; amende_payee?: boolean | null };
export function ifsaSanctionStatus(s: SanctionState): 'payee' | 'levee' | 'impayee' | 'active' {
  if (s.type_sanction === 'amende' && s.amende_payee) return 'payee';
  if (!s.actif) return 'levee';
  return s.type_sanction === 'amende' ? 'impayee' : 'active';
}
export function matchesIfsaSanctionFilter(s: SanctionState, filter: string): boolean {
  const status = ifsaSanctionStatus(s);
  if (filter === 'levees') return status === 'levee';
  if (filter === 'amendes_payees') return status === 'payee';
  if (filter === 'amendes_impayees') return status === 'impayee';
  if (filter === 'actives') return status === 'active' || status === 'impayee';
  return true;
}
