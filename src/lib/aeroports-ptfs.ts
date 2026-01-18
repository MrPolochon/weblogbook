/**
 * Aéroports PTFS (Pilot Training Flight Simulator) avec codes OACI.
 * Source: https://ptfs.app/charts — liste officielle.
 */
export const AEROPORTS_PTFS = [
  { code: 'IBAR', nom: 'Barra Airport' },
  { code: 'IHEN', nom: 'Henstridge Airfield' },
  { code: 'ILAR', nom: 'Larnaca Intl.' },
  { code: 'IIAB', nom: 'McConnell AFB' },
  { code: 'IPAP', nom: 'Paphos Intl.' },
  { code: 'IGRV', nom: 'Grindavik Airport' },
  { code: 'IJAF', nom: 'Al Najaf' },
  { code: 'IZOL', nom: 'Izolirani Intl.' },
  { code: 'ISCM', nom: 'RAF Scampton' },
  { code: 'IBRD', nom: 'Bird Island Airfield' },
  { code: 'IDCS', nom: 'Saba Airport' },
  { code: 'ITKO', nom: 'Tokyo Intl.' },
  { code: 'ILKL', nom: 'Lukla Airport' },
  { code: 'IPPH', nom: 'Perth Intl.' },
  { code: 'IGAR', nom: 'Air Base Garry' },
  { code: 'IBLT', nom: 'Boltic Airfield' },
  { code: 'IRFD', nom: 'Greater Rockford' },
  { code: 'IMLR', nom: 'Mellor Intl.' },
  { code: 'ITRC', nom: 'Training Centre' },
  { code: 'IBTH', nom: 'Saint Barthelemy' },
  { code: 'IUFO', nom: 'UFO Base' },
  { code: 'ISAU', nom: 'Sauthamptona Airport' },
  { code: 'ISKP', nom: 'Skopelos Airfield' },
] as const;

export const CODES_OACI_VALIDES: Set<string> = new Set(AEROPORTS_PTFS.map((a) => a.code));

export function getAeroportLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const a = AEROPORTS_PTFS.find((x) => x.code === code);
  return a ? `${a.code} – ${a.nom}` : code;
}

export function getAeroportNom(code: string | null | undefined): string {
  if (!code) return '—';
  const a = AEROPORTS_PTFS.find((x) => x.code === code);
  return a ? a.nom : code;
}
