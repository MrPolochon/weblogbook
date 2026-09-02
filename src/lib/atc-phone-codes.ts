// Codes de telephonie ATC partages entre frontend (AtcTelephone.tsx,
// SiaviTelephone.tsx) et backend (/api/atc/telephone/*).
// Format d'un numero complet : <code_aero (4 chiffres)><code_position (2-4 chiffres)>
// Exemple : 556618 = ITKO Tower, 55669999 = ITKO ATIS.

export const POSITION_CODES: Record<string, string> = {
  Delivery: '15',
  Clairance: '16',
  Ground: '17',
  Tower: '18',
  DEP: '191',
  APP: '192',
  Center: '20',
  AFIS: '505',
  // 9999 = ATIS automatique. L'appel est intercepte par le backend qui
  // retourne le texte ATIS courant (lu via Web Speech API cote client).
  ATIS: '9999',
};

export const CODE_TO_POSITION: Record<string, string> = Object.fromEntries(
  Object.entries(POSITION_CODES).map(([pos, code]) => [code, pos])
);

export const AEROPORT_CODES: Record<string, string> = {
  ITKO: '5566',
  IPPH: '5567',
  ILAR: '5568',
  IPAP: '5569',
  IRFD: '5570',
  IMLR: '5571',
  IZOL: '5572',
  ISAU: '5573',
  IJAF: '5574',
  IBLT: '5575',
  IDCS: '5576',
  IKFL: '5577',
  IBTH: '5578',
  ISKP: '5579',
  ILKL: '5580',
  IBAR: '5581',
  IHEN: '5582',
  ITRC: '5583',
  IBRD: '5584',
  IUFO: '5585',
  IIAB: '5586',
  IGAR: '5587',
  ISCM: '5588',
  ITEY: '5589',
};

export const CODE_TO_AEROPORT: Record<string, string> = Object.fromEntries(
  Object.entries(AEROPORT_CODES).map(([icao, code]) => [code, icao])
);

/**
 * Detecte si un numero compose est un appel ATIS et renvoie le code OACI cible.
 * Format : <code_aero_4_chiffres>9999 (ex: 55669999 -> ITKO).
 * Retourne null si ce n'est pas un appel ATIS.
 */
export function parseAtisCall(number: string): { airport_icao: string } | null {
  const trimmed = number.trim();
  if (!trimmed.endsWith('9999')) return null;
  const codePart = trimmed.slice(0, -4);
  if (codePart.length !== 4) return null;
  const icao = CODE_TO_AEROPORT[codePart];
  if (!icao) return null;
  return { airport_icao: icao };
}

export const LOCAL_POSITION_SHORTCUTS: { code: string; position: string; short: string }[] = [
  { code: '*15', position: 'Delivery', short: 'DEL' },
  { code: '*16', position: 'Clairance', short: 'CLR' },
  { code: '*17', position: 'Ground', short: 'GND' },
  { code: '*18', position: 'Tower', short: 'TWR' },
  { code: '*191', position: 'DEP', short: 'DEP' },
  { code: '*192', position: 'APP', short: 'APP' },
  { code: '*20', position: 'Center', short: 'CTR' },
];

export type ParsedDial = {
  aeroport: string | null;
  position: string | null;
  isLocal: boolean;
  isEmergency: boolean;
  isAtis: boolean;
  label: string | null;
  ready: boolean;
};

/** Interprète un numéro composé (local *xx, +14, ATIS, urgence). */
export function parseDialedNumber(num: string, localAirport?: string): ParsedDial {
  const trimmed = num.trim();
  if (!trimmed) {
    return { aeroport: null, position: null, isLocal: false, isEmergency: false, isAtis: false, label: null, ready: false };
  }

  const atis = parseAtisCall(trimmed);
  if (atis) {
    return {
      aeroport: atis.airport_icao,
      position: 'ATIS',
      isLocal: false,
      isEmergency: false,
      isAtis: true,
      label: `ATIS ${atis.airport_icao}`,
      ready: true,
    };
  }

  if (trimmed === '911' || trimmed === '112') {
    return {
      aeroport: null,
      position: 'AFIS',
      isLocal: false,
      isEmergency: true,
      isAtis: false,
      label: `Urgence AFIS (${trimmed})`,
      ready: true,
    };
  }

  if (trimmed.startsWith('*')) {
    const code = trimmed.slice(1);
    const position = CODE_TO_POSITION[code] || null;
    return {
      aeroport: localAirport ?? null,
      position,
      isLocal: true,
      isEmergency: false,
      isAtis: false,
      label: position ? `${position} · local` : null,
      ready: Boolean(position),
    };
  }

  if (trimmed.startsWith('+14')) {
    const rest = trimmed.slice(3);
    const aeroCode = rest.slice(0, 4);
    const posCode = rest.slice(4);
    const destAeroport = aeroCode.length === 4 ? (CODE_TO_AEROPORT[aeroCode] || null) : null;
    const position = posCode ? (CODE_TO_POSITION[posCode] || null) : null;
    const parts = [destAeroport, position].filter(Boolean);
    return {
      aeroport: destAeroport,
      position,
      isLocal: false,
      isEmergency: false,
      isAtis: false,
      label: parts.length > 0 ? parts.join(' · ') : null,
      ready: Boolean(destAeroport && position),
    };
  }

  return { aeroport: null, position: null, isLocal: false, isEmergency: false, isAtis: false, label: null, ready: false };
}

export function formatStationNumber(aeroport: string, position: string): string | null {
  const a = AEROPORT_CODES[aeroport];
  const p = POSITION_CODES[position];
  if (!a || !p) return null;
  return `+14${a}${p}`;
}
