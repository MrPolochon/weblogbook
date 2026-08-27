import { createAdminClient } from '@/lib/supabase/admin';
import { motifLabel, participantsOf, type TranscriptMessage } from '@/lib/support/transcript';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Transcript ticket',
  robots: { index: false, follow: false },
};

function formatWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function TranscriptPage({ params }: { params: { token: string } }) {
  const token = String(params.token || '').trim();
  if (!token || token.length < 16) notFound();

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select(
      'short_id, motif, reason_text, discord_username, discord_user_id, closed_by, closed_at, created_at, transcript_messages, conversation',
    )
    .eq('transcript_token', token)
    .maybeSingle();

  if (!ticket) notFound();

  const stored = ticket.transcript_messages as TranscriptMessage[] | null;
  const messages: TranscriptMessage[] = Array.isArray(stored) ? stored : [];
  const people = participantsOf(messages);
  const opener = String(ticket.discord_username || ticket.discord_user_id || 'Membre');

  return (
    <main className="min-h-screen bg-[#313338] text-[#dbdee1]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 rounded-xl border border-[#3f4147] bg-[#2b2d31] p-5">
          <p className="text-xs uppercase tracking-wide text-[#949ba4]">Transcript</p>
          <h1 className="mt-1 text-xl font-bold text-white">Ticket #{ticket.short_id}</h1>
          <p className="mt-1 text-sm text-[#b5bac1]">
            {motifLabel(String(ticket.motif))}
            {ticket.reason_text ? ` — ${String(ticket.reason_text).slice(0, 180)}` : ''}
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[#949ba4]">Ouvert par</dt>
              <dd className="font-medium text-white">{opener}</dd>
            </div>
            <div>
              <dt className="text-[#949ba4]">Fermé</dt>
              <dd className="font-medium text-white">
                {ticket.closed_at ? formatWhen(String(ticket.closed_at)) : '—'}
                {ticket.closed_by ? ` · ${ticket.closed_by}` : ''}
              </dd>
            </div>
          </dl>
          {people.length > 0 && (
            <p className="mt-3 text-xs text-[#949ba4]">
              {people
                .map((p) => `${p.authorName} (${p.count})`)
                .join(' · ')}
            </p>
          )}
        </header>

        <ol className="space-y-3">
          {messages.length === 0 ? (
            <li className="rounded-lg bg-[#2b2d31] p-4 text-sm text-[#949ba4]">
              Aucun message enregistré pour ce ticket.
            </li>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const grouped = prev && prev.authorId === m.authorId;
              const isBot = m.bot;
              return (
                <li
                  key={m.id || `${m.authorId}-${i}`}
                  className={grouped ? 'pt-0' : 'pt-2'}
                >
                  <article
                    className={`rounded-lg px-3 py-2 ${
                      isBot ? 'bg-[#2b2d31]' : 'bg-[#2e3035]'
                    }`}
                  >
                    {!grouped && (
                      <div className="mb-1 flex items-baseline gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isBot ? 'text-[#5865f2]' : 'text-[#f2f3f5]'
                          }`}
                        >
                          {m.authorName}
                          {isBot ? ' · bot' : ''}
                        </span>
                        {m.at ? (
                          <time className="text-[11px] text-[#949ba4]" dateTime={m.at}>
                            {formatWhen(m.at)}
                          </time>
                        ) : null}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#dbdee1]">
                      {m.content}
                    </p>
                  </article>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </main>
  );
}
