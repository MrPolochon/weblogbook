export type TicketTurn = { role: 'user' | 'assistant' | 'staff'; content: string };

/**
 * Derniers tours envoyés au LLM. Le quota Groq est de 8K tokens/minute pour
 * l’ensemble prompt système + contexte + historique + réponse : au-delà de ces
 * bornes, deux tickets simultanés suffisent à déclencher des 429.
 */
const MAX_TURNS = 10;
const MAX_TURN_CHARS = 600;
const MAX_MEMORY_CHARS = 1200;

export function clipTurn(content: string): string {
  const t = content.trim();
  if (t.length <= MAX_TURN_CHARS) return t;
  return `${t.slice(0, MAX_TURN_CHARS)}…`;
}

export function trimConversation(turns: TicketTurn[]): TicketTurn[] {
  if (turns.length <= MAX_TURNS) return turns;
  return turns.slice(-MAX_TURNS);
}

/** Faits stables extraits du texte (immat, identifiant, montants) — survivent à la coupe de l’historique. */
export function extractFacts(text: string): string[] {
  const facts: string[] = [];
  const immat = text.match(/\b[A-Z]{1,2}-[A-Z0-9]{3,5}\b/gi);
  if (immat) for (const x of immat) facts.push(`Immat: ${x.toUpperCase()}`);
  const ident = text.match(/\bidentifiant\s*[:\s]+([A-Za-z0-9._-]{3,32})/i);
  if (ident) facts.push(`Identifiant: ${ident[1]}`);
  const vol = text.match(/\b(?:vol|flight)\s*[:#]?\s*([A-Z]{2,3}\s?\d{2,5})\b/i);
  if (vol) facts.push(`Vol: ${vol[1].toUpperCase()}`);
  const compagnie = text.match(/\bcompagnie\s*[:\s]+(.{3,40})/i);
  if (compagnie) facts.push(`Compagnie: ${compagnie[1].trim()}`);
  return facts;
}

export function mergeMemory(previous: string, additions: string[]): string {
  const lines = new Set(
    (previous || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  );
  for (const a of additions) lines.add(a);
  let out = Array.from(lines).join('\n');
  if (out.length > MAX_MEMORY_CHARS) out = out.slice(-MAX_MEMORY_CHARS);
  return out;
}

export function ticketContextBlock(ticket: {
  short_id?: string;
  motif?: string;
  reason_text?: string | null;
  memory_notes?: string | null;
}): string {
  return [
    `Ticket #${ticket.short_id || '?'} (ce salon uniquement — n'utilise aucun autre ticket).`,
    `Motif: ${ticket.motif || 'assistance'}`,
    `Raison d'ouverture: ${(ticket.reason_text || '').slice(0, 400)}`,
    // Volontairement pas de pseudo Discord : l'IA s'en servait comme prénom
    // (« Bonjour Frank ») alors qu'il ne correspond pas toujours à la personne.
    ticket.memory_notes ? `Faits déjà établis dans CE ticket:\n${ticket.memory_notes}` : '',
    'Tu dois te souvenir de ces faits et des messages ci-dessous. Ne les redis pas tous : utilise-les.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function toLlmMessages(
  system: string,
  context: string,
  turns: TicketTurn[],
  latestUser: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
    { role: 'system', content: context },
  ];
  for (const t of trimConversation(turns)) {
    if (t.role === 'staff') {
      messages.push({ role: 'user', content: `[Message staff] ${clipTurn(t.content)}` });
    } else if (t.role === 'assistant') {
      messages.push({ role: 'assistant', content: clipTurn(t.content) });
    } else {
      messages.push({ role: 'user', content: clipTurn(t.content) });
    }
  }
  messages.push({ role: 'user', content: clipTurn(latestUser) });
  return messages;
}
