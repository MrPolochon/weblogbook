/** Boutons persistants d’un ticket (custom_id inchangés — handlers Python + HTTP). */
export const TICKET_ACTION_COMPONENTS = [
  {
    type: 1,
    components: [
      { type: 2, style: 3, custom_id: 'support_resolved', label: "C'est résolu" },
      { type: 2, style: 4, custom_id: 'support_need_staff', label: 'Pas résolu — staff' },
      { type: 2, style: 2, custom_id: 'support_staff_close', label: 'Fermer (staff)' },
    ],
  },
];

export const RESOLU_MARKER = '[[RESOLU]]';

const RESOLUTION_NOTE = 'resolution_offered=1';

export function hasResoluMarker(text: string): boolean {
  return /\[\[\s*RESOLU\s*\]\]/i.test(text);
}

export function stripResoluMarker(text: string): string {
  return text
    .replace(/^\s*\[\[\s*RESOLU\s*\]\]\s*$/gim, '')
    .replace(/\s*\[\[\s*RESOLU\s*\]\]\s*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function asksIfResolved(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /c[''\u2019]?est r[eé]solu\s*\?/.test(t) ||
    /on (peut|pourra) fermer/.test(t) ||
    /je (peux|pourrai) fermer/.test(t) ||
    /plus besoin d[''\u2019]?aide/.test(t)
  );
}

/** Marqueur explicite en priorité ; sinon formulation « C'est résolu ? » si on n'escalade pas. */
export function iaOffersResolution(rawReply: string, escalate: boolean): boolean {
  if (escalate) return false;
  if (hasResoluMarker(rawReply)) return true;
  return asksIfResolved(rawReply);
}

export function ticketAlreadyOfferedResolution(ticket: {
  resolution_offered?: boolean | null;
  memory_notes?: string | null;
}): boolean {
  if (ticket.resolution_offered === true) return true;
  return (ticket.memory_notes || '')
    .split('\n')
    .some((l) => l.trim() === RESOLUTION_NOTE);
}

export function withResolutionOfferedNote(memory: string, offered: boolean): string {
  const lines = (memory || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== RESOLUTION_NOTE);
  if (offered) lines.push(RESOLUTION_NOTE);
  return lines.join('\n');
}

export const RESOLUTION_PANEL_TEXT =
  "Si c’est bon, clique **C'est résolu**. Sinon **Pas résolu — staff** (Fermer = staff uniquement).";
