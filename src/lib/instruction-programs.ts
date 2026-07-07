export type InstructionModule = {
  code: string;
  title: string;
  description: string;
};

export type InstructionProgram = {
  licenceCode: string;
  label: string;
  modules: InstructionModule[];
};

/**
 * Programmes de formation actifs — réforme juillet 2026.
 * Supprimés : PPL, CPL, IR ME, ATPL.
 * Seul le parcours ATC-INIT (vers LATC) reste actif.
 */
export const INSTRUCTION_PROGRAMS: InstructionProgram[] = [
  {
    licenceCode: 'ATC-INIT',
    label: 'Formation ATC (vers LATC)',
    modules: [
      { code: 'A1', title: 'Espace aérien et rôles ATC', description: "Classes d'espace, services de base, coordination." },
      { code: 'A2', title: 'Phraséologie et clairance', description: 'Clearances, lecture en retour, strip mentaux.' },
      { code: 'A3', title: 'Séparation et séquences', description: 'Séparation IFR/VFR, arrivals, departures, vecteurs.' },
      { code: 'A4', title: 'Situations de charge / coord.', description: 'Délégation, pannes, coordination multi-positions.' },
      { code: 'A5', title: 'Test blanc pratique', description: 'Synthèse scénario type avant session examen (ATC FE).' },
    ],
  },
];

/** Parcours théorique / pratique côté tour (élèves détenteurs ATC FI / ATC FE en référent). */
export const ATC_INIT_LICENCE_CODE = 'ATC-INIT' as const;

export function isAtcInstructionProgram(licenceCode: string | null | undefined): boolean {
  if (!licenceCode) return false;
  return licenceCode === ATC_INIT_LICENCE_CODE;
}

export const INSTRUCTION_LICENCE_CODES = INSTRUCTION_PROGRAMS.map((p) => p.licenceCode);

export function getProgramByLicence(licenceCode: string | null | undefined): InstructionProgram | null {
  if (!licenceCode) return null;
  return INSTRUCTION_PROGRAMS.find((p) => p.licenceCode === licenceCode) || null;
}
