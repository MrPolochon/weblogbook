/**
 * Licences actives — réforme juillet 2026.
 * Supprimés : PPL, CPL, ATPL, IR ME, Multi Crew attestation,
 *             CLASS-M, CLASS-MT, CLASS-MRP, IFR, VFR, COM 1-6.
 */
export const ALL_LICENCE_TYPES = [
  'FI', 'FE', 'ATC FI', 'ATC FE',
  'Qualification Type',
  'CAT 1', 'CAT 2', 'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
  'C1', 'C2', 'C3', 'C4', 'C6',
  'CAL-ATC', 'CAL-AFIS',
  'PCAL-ATC', 'PCAL-AFIS',
  'LPAFIS', 'LATC',
] as const;
