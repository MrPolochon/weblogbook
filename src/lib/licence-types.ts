/**
 * Catalogues de licences — réforme juillet 2026.
 *
 * Conservées : VFR, IFR, COM 1–6 (+ langue), CAT 1–6, titres instruction
 * (FI, FE, ATC FI, ATC FE), qualifications opérationnelles (LATC, CAL-*, etc.).
 *
 * Supprimées (programmes classiques / legacy) : PPL, CPL, ATPL, IR ME,
 * Multi Crew attestation, CLASS-M, CLASS-MT, CLASS-MRP.
 */
export const REMOVED_LICENCE_TYPES = [
  'PPL',
  'CPL',
  'ATPL',
  'IR ME',
  'Multi Crew attestation',
  'CLASS-M',
  'CLASS-MT',
  'CLASS-MRP',
] as const;

export const ALL_LICENCE_TYPES = [
  'FI',
  'FE',
  'ATC FI',
  'ATC FE',
  'Qualification Type',
  'VFR',
  'IFR',
  'CAT 1',
  'CAT 2',
  'CAT 3',
  'CAT 4',
  'CAT 5',
  'CAT 6',
  'C1',
  'C2',
  'C3',
  'C4',
  'C6',
  'CAL-ATC',
  'CAL-AFIS',
  'PCAL-ATC',
  'PCAL-AFIS',
  'LPAFIS',
  'LATC',
  'COM 1',
  'COM 2',
  'COM 3',
  'COM 4',
  'COM 5',
  'COM 6',
] as const;

export type LicenceType = (typeof ALL_LICENCE_TYPES)[number];

export const COM_LICENCE_TYPES = [
  'COM 1',
  'COM 2',
  'COM 3',
  'COM 4',
  'COM 5',
  'COM 6',
] as const;

export type ComLicenceType = (typeof COM_LICENCE_TYPES)[number];

/** Langues fréquentes pour les COM (champ libre `langue` en base). */
export const COM_LANGUE_SUGGESTIONS = [
  'Français',
  'Anglais',
  'Espagnol',
  'Allemand',
  'Italien',
] as const;

export function isComLicenceType(type: string | null | undefined): type is ComLicenceType {
  if (!type) return false;
  return (COM_LICENCE_TYPES as readonly string[]).includes(type);
}

export function isActiveLicenceType(type: string | null | undefined): type is LicenceType {
  if (!type) return false;
  return (ALL_LICENCE_TYPES as readonly string[]).includes(type);
}

export function isRemovedLicenceType(type: string | null | undefined): boolean {
  if (!type) return false;
  return (REMOVED_LICENCE_TYPES as readonly string[]).includes(type);
}

type LicenceLabelInput = {
  type: string;
  langue?: string | null;
  types_avion?: { nom: string; constructeur: string } | null;
};

/** Libellé affiché d'une licence délivrée (profil, admin, IFSA). */
export function formatLicenceLabel(lic: LicenceLabelInput): string {
  if (lic.type === 'Qualification Type' && lic.types_avion) {
    return `Qualification Type ${lic.types_avion.constructeur} ${lic.types_avion.nom}`;
  }
  if (isComLicenceType(lic.type)) {
    const lang = lic.langue?.trim();
    return lang ? `${lic.type} (${lang})` : `${lic.type} (langue non renseignée)`;
  }
  return lic.type;
}

/** Libellé pour les listes déroulantes examen / training (type seul ; langue à la délivrance pour COM). */
export function formatLicenceOptionLabel(type: string): string {
  if (isComLicenceType(type)) {
    return `${type} — langue précisée à la délivrance`;
  }
  return type;
}
