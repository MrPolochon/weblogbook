import { randomUUID } from 'crypto';
import { OFFICIAL_SITE_URL } from '@/lib/site-url';
import { SUPPORT_MOTIFS } from '@/lib/support/motifs';

export type TranscriptMessage = {
  id: string;
  at: string;
  authorId: string;
  authorName: string;
  bot: boolean;
  content: string;
};

export type TranscriptParticipant = {
  authorId: string;
  authorName: string;
  bot: boolean;
  count: number;
};

type DiscordAuthor = {
  id?: string;
  username?: string;
  global_name?: string;
  bot?: boolean;
};

type DiscordRawMessage = {
  id?: string;
  timestamp?: string;
  content?: string;
  author?: DiscordAuthor;
};

export function publicSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || OFFICIAL_SITE_URL;
  return String(fromEnv).replace(/\/$/, '');
}

export function transcriptPageUrl(token: string): string {
  return `${publicSiteUrl()}/support/transcript/${encodeURIComponent(token)}`;
}

export function motifLabel(id: string | null | undefined): string {
  return SUPPORT_MOTIFS.find((m) => m.id === id)?.label || id || 'Assistance';
}

export function newTranscriptToken(): string {
  return randomUUID();
}

export function parseDiscordMessages(raw: unknown): TranscriptMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptMessage[] = [];
  for (const item of raw) {
    const m = item as DiscordRawMessage;
    const authorId = String(m.author?.id || '');
    if (!authorId) continue;
    out.push({
      id: String(m.id || ''),
      at: String(m.timestamp || new Date().toISOString()),
      authorId,
      authorName: String(m.author?.global_name || m.author?.username || authorId),
      bot: Boolean(m.author?.bot),
      content: String(m.content || '').trim() || '*(pièce jointe ou message vide)*',
    });
  }
  // Discord renvoie du plus récent au plus ancien.
  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}

export function messagesFromConversation(conversation: unknown, openerName: string): TranscriptMessage[] {
  if (!Array.isArray(conversation)) return [];
  return conversation
    .map((turn, i) => {
      const t = turn as { role?: string; content?: string };
      const role = String(t.role || 'user');
      const bot = role === 'assistant';
      return {
        id: `conv-${i}`,
        at: '',
        authorId: role,
        authorName: bot ? 'Assistance PTFR' : role === 'staff' ? 'Staff' : openerName || 'Membre',
        bot,
        content: String(t.content || '').trim(),
      };
    })
    .filter((m) => m.content);
}

export function participantsOf(messages: TranscriptMessage[]): TranscriptParticipant[] {
  const map = new Map<string, TranscriptParticipant>();
  for (const m of messages) {
    const prev = map.get(m.authorId);
    if (prev) prev.count += 1;
    else map.set(m.authorId, { authorId: m.authorId, authorName: m.authorName, bot: m.bot, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function formatClosedBy(closedBy: string, openerId: string): { label: string; mention: string } {
  const raw = String(closedBy || '').trim();
  if (raw === 'inactivite') return { label: 'inactivité', mention: 'fermeture automatique' };
  const staff = raw.match(/^staff:(.+)$/);
  if (staff) return { label: staff[1], mention: `<@${staff[1]}>` };
  const user = raw.match(/^user:(.+)$/);
  if (user) {
    const id = user[1] === 'unknown' ? openerId : user[1];
    return { label: id, mention: id ? `<@${id}>` : 'le demandeur' };
  }
  return { label: raw || 'inconnu', mention: raw || 'inconnu' };
}

export function unixSeconds(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000);
}

export function firstStaffClaim(
  messages: TranscriptMessage[],
  openerId: string,
): TranscriptMessage | null {
  return messages.find((m) => !m.bot && m.authorId !== openerId) || null;
}

export function textTranscriptDump(
  shortId: string,
  motif: string,
  opener: string,
  reason: string,
  closedBy: string,
  messages: TranscriptMessage[],
): string {
  let out = `Ticket ${shortId} | motif ${motif} | ${opener}\nRaison: ${reason}\nFermé par: ${closedBy}\n\n`;
  for (const m of messages) {
    const who = m.bot ? '[BOT]' : m.authorName;
    out += `[${m.at || '—'}] ${who}: ${m.content}\n`;
  }
  return out;
}
