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

export const INSTRUCTION_PROGRAMS: InstructionProgram[] = [
  {
    licenceCode: 'PPL',
    label: 'PPL - Pilote privé',
    modules: [
      { code: 'C1', title: 'Documents, préparation et mise en oeuvre', description: 'Docs VFR, préparation, plan de vol.' },
      { code: 'C2', title: 'Roulage, assiettes, virages', description: 'Mise en route, roulage, montée, palier, virages.' },
      { code: 'C3', title: 'Puissance/vitesse/incidence et décrochage', description: 'Vol lent, décrochage et récupération.' },
      { code: 'C4', title: 'Phraséologie', description: 'Phraséologie standard et adaptée, division d’attention.' },
      { code: 'C5', title: 'Tour de piste', description: 'Axe, plan, vitesse, remise des gaz, arrondi.' },
      { code: 'C6', title: 'Traitement de panne', description: 'Pannes avant/après rotation, urgence et détresse.' },
      { code: 'C7', title: 'Navigation et déroutement', description: 'Préparation nav, boussole, points remarquables.' },
      { code: 'C8', title: 'Test blanc PPL', description: 'Synthèse complète pratique avant examen.' },
    ],
  },
  {
    licenceCode: 'CPL',
    label: 'CPL - Pilote professionnel',
    modules: [
      { code: 'M1', title: 'Standardisation SOP', description: 'Procédures pro, discipline cockpit.' },
      { code: 'M2', title: 'Vol commercial', description: 'Gestion passagers/cargo et sécurité opérationnelle.' },
      { code: 'M3', title: 'Navigation avancée', description: 'Planification et déroutements complexes.' },
      { code: 'M4', title: 'Évaluation finale CPL', description: 'Mise en situation complète.' },
    ],
  },
  {
    licenceCode: 'IR ME',
    label: 'IR ME - Vol aux instruments multi-moteurs',
    modules: [
      { code: 'M1', title: 'Procédures IFR', description: 'Départs IFR, routes, arrivées et minima.' },
      { code: 'M2', title: 'Gestion multi-moteurs', description: 'Asymétrie, pannes et performances.' },
      { code: 'M3', title: 'Approches', description: 'Approches de précision et non-précision.' },
      { code: 'M4', title: 'Contrôle final IR ME', description: 'Vol de contrôle instrument complet.' },
    ],
  },
  {
    licenceCode: 'ATPL',
    label: 'ATPL - Pilote de ligne',
    modules: [
      { code: 'M1', title: 'Opérations ligne', description: 'Briefings, CRM, prise de décision.' },
      { code: 'M2', title: 'Gestion dégradée', description: 'Abnormales et urgences complexes.' },
      { code: 'M3', title: 'Performance avancée', description: 'Performance et limitations opérationnelles.' },
      { code: 'M4', title: 'Check final ATPL', description: 'Évaluation opérationnelle complète.' },
    ],
  },
  {
    licenceCode: 'ATC-INIT',
    label: 'Formation ATC (vers LATC)',
    modules: [
      { code: 'A1', title: 'Espace aérien et rôles ATC', description: 'Classes d’espace, services de base, coordination.' },
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
