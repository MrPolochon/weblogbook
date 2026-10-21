export const SIAVI_WORKSPACES = {
 pompier: { href: '/siavi/pompier', label: 'Pompier aéroportuaire', description: 'Secours au sol et coordination des interventions.' },
 afis: { href: '/siavi/afis', label: 'Pompier AFIS', description: 'Information de vol et surveillance des aérodromes.' },
 medevac: { href: '/siavi/medevac', label: 'Équipage MEDEVAC', description: 'Missions, console de vol et transpondeur.' },
} as const;
export type SiaviWorkspace = keyof typeof SIAVI_WORKSPACES;
export function medevacFlightPath(id: string) { return '/siavi/medevac/vol/' + encodeURIComponent(id); }
