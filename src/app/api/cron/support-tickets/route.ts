export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { discordSendMessage } from '@/lib/support/discord-api';
import { closeSupportTicket } from '@/lib/support/close-ticket';
import { escalateTicketToStaff } from '@/lib/support/escalate';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Délais d'inactivité, comptés depuis le dernier message HUMAIN du salon
 * (`last_human_at`) : les messages du bot ne relancent jamais le compteur.
 *
 * Un ticket ouvert le matin ne doit plus être supprimé pendant une journée de
 * cours : 3 h = simple rappel, 24 h = second rappel, 72 h = décision.
 *   - personne n'a jamais répondu après l'accueil  → fermeture + suppression
 *   - le membre avait engagé la discussion         → remise au staff (🔴)
 * Après la remise au staff, on laisse encore 72 h avant de fermer.
 */
const FIRST_PING_MS = 3 * HOUR_MS;
const SECOND_PING_MS = 24 * HOUR_MS;
const DECISION_MS = 72 * HOUR_MS;
const AFTER_HANDOVER_MS = 72 * HOUR_MS;

/** Étapes stockées dans `support_tickets.inactivity_nudge`. */
const STEP_NONE = 0;
const STEP_FIRST_PING = 1;
const STEP_SECOND_PING = 2;
const STEP_HANDED_OVER = 3;

const PINGS: Array<(mention: string) => string> = [
  (mention) =>
    `${mention} Pas de nouvelle depuis **3 heures**. Tu as encore besoin d’aide ? Réponds ici quand tu veux, le ticket reste ouvert.`,
  (mention) =>
    `${mention} Toujours aucune réponse depuis **24 heures**. Sans message de ta part, ce ticket sera traité automatiquement dans **72 heures** (fermeture, ou transmission à un staff si ta demande est restée en suspens).`,
];

function cronOk(request: NextRequest): boolean {
  const secret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

/**
 * Le membre a-t-il parlé après le message d'accueil ? À l'ouverture le ticket
 * est en statut `ia` avec exactement 2 tours (raison + accueil du bot).
 */
function memberEngaged(ticket: { statut?: string | null; conversation?: unknown }): boolean {
  if (String(ticket.statut || 'ia') !== 'ia') return true;
  return Array.isArray(ticket.conversation) && ticket.conversation.length > 2;
}

async function run() {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: tickets, error } = await admin
    .from('support_tickets')
    .select('id, short_id, channel_id, discord_user_id, statut, conversation, last_human_at, last_nudge_at, inactivity_nudge')
    .is('closed_at', null)
    .limit(200);

  if (error) throw new Error(error.message);

  const nudged: string[] = [];
  const handedOver: string[] = [];
  const closed: string[] = [];

  for (const t of tickets || []) {
    const step = Number(t.inactivity_nudge || 0);
    const lastHuman = new Date(t.last_human_at || 0).getTime();
    const lastNudge = t.last_nudge_at ? new Date(t.last_nudge_at).getTime() : 0;
    const mention = `<@${t.discord_user_id}>`;
    const silence = lastHuman ? now - lastHuman : 0;

    try {
      // Déjà remis au staff : on ne ferme que si même le staff n'a rien fait.
      if (step >= STEP_HANDED_OVER) {
        if (lastNudge && now - lastNudge >= AFTER_HANDOVER_MS) {
          await closeSupportTicket({ channelId: t.channel_id, closedBy: 'inactivite' });
          closed.push(t.short_id);
        }
        continue;
      }

      if (!lastHuman) continue;

      if (silence >= DECISION_MS) {
        if (!memberEngaged(t)) {
          await closeSupportTicket({ channelId: t.channel_id, closedBy: 'inactivite' });
          closed.push(t.short_id);
          continue;
        }
        await discordSendMessage(
          t.channel_id,
          `${mention} Aucune réponse depuis **72 heures** et ta demande n’a pas été conclue. Je passe la main à un staff pour la terminer — le ticket reste ouvert.`,
        );
        await escalateTicketToStaff(
          t.channel_id,
          'Ticket inactif depuis 72 h, demande non terminée : merci de la reprendre.',
        );
        await admin
          .from('support_tickets')
          .update({
            inactivity_nudge: STEP_HANDED_OVER,
            last_nudge_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', t.id);
        handedOver.push(t.short_id);
        continue;
      }

      const nextStep =
        step < STEP_FIRST_PING && silence >= FIRST_PING_MS
          ? STEP_FIRST_PING
          : step < STEP_SECOND_PING && silence >= SECOND_PING_MS
            ? STEP_SECOND_PING
            : STEP_NONE;
      if (nextStep === STEP_NONE) continue;

      await discordSendMessage(t.channel_id, PINGS[nextStep - 1](mention));
      await admin
        .from('support_tickets')
        .update({
          inactivity_nudge: nextStep,
          last_nudge_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      nudged.push(`${t.short_id}:${nextStep}`);
    } catch (e) {
      console.error('[support inactivity]', t.short_id, e);
    }
  }

  return { ok: true, scanned: tickets?.length ?? 0, nudged, handed_over: handedOver, closed };
}

export async function GET(request: NextRequest) {
  if (!cronOk(request)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
