import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAtisBot } from '@/lib/atis-bot-api';
import { INACTIVITY_DELETE_DELAY_DAYS, INACTIVITY_THRESHOLD_DAYS } from '@/lib/admin/inactivity-warning';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BodySchema = z.object({
  identifiant: z.string().min(1),
});

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  ''
).replace(/\/$/, '');

function buildDmContent(identifiant: string, deleteAfter: Date): string {
  const dateStr = deleteAfter.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return [
    `Salut ${identifiant},`,
    '',
    `Tu n'as pas remis le pied dans ton logbook depuis plus de ${INACTIVITY_THRESHOLD_DAYS} jours.`,
    `Pour preserver le stockage du serveur, ton compte sera **supprime automatiquement le ${dateStr}** si tu ne te reconnectes pas d'ici la.`,
    '',
    'Que faire pour garder ton compte ?',
    '> Connecte-toi sur le site, c\'est tout. Le compteur sera reinitialise automatiquement.',
    '',
    SITE_URL ? `Lien : ${SITE_URL}/login` : '',
    '',
    'Si tu n\'as plus l\'intention de revenir, tu peux ignorer ce message : ton compte et tes donnees seront effaces a la date indiquee.',
    '',
    '[TEST] — Mixou Airlines / IFSA',
  ].filter(Boolean).join('\n');
}

/**
 * POST /api/admin/inactivity/test-dm
 *
 * Body : { identifiant: string }
 *
 * Envoie le DM d'inactivite a un utilisateur EN MODE TEST :
 *   - n'ecrit RIEN en BDD (pas de status, pas de delete_after)
 *   - ne filtre pas sur l'inactivite (peut envoyer a n'importe qui)
 *   - le DM contient "[TEST]" en signature pour distinguer du vrai
 *
 * Reservee aux admins.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Reserve aux admins' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'identifiant requis' }, { status: 400 });

  const admin = createAdminClient();

  const { data: target } = await admin
    .from('profiles')
    .select('id, identifiant')
    .eq('identifiant', parsed.data.identifiant)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: `Utilisateur "${parsed.data.identifiant}" introuvable` }, { status: 404 });

  const { data: link } = await admin
    .from('discord_links')
    .select('discord_user_id, status')
    .eq('user_id', target.id as string)
    .maybeSingle();

  if (!link?.discord_user_id) {
    return NextResponse.json({ error: 'Aucun compte Discord lie pour cet utilisateur' }, { status: 400 });
  }
  if (link.status === 'temporary_block' || link.status === 'permanent_block') {
    return NextResponse.json({ error: `Compte Discord bloque (${link.status})` }, { status: 400 });
  }

  const deleteAfter = new Date(Date.now() + INACTIVITY_DELETE_DELAY_DAYS * 24 * 60 * 60 * 1000);
  const content = buildDmContent((target.identifiant as string) ?? 'Pilote', deleteAfter);

  const dmRes = await fetchAtisBot<{ ok?: boolean }>('/webhook/dm', {
    method: 'POST',
    timeoutMs: 15000,
    body: {
      discord_user_id: link.discord_user_id,
      title: '[TEST] Avis de suppression de compte pour inactivite',
      content,
      link: SITE_URL ? `${SITE_URL}/login` : null,
    },
  });

  if (dmRes.error) {
    return NextResponse.json({
      ok: false,
      error: dmRes.error,
      status: dmRes.status,
      sent_to: link.discord_user_id,
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sent_to: link.discord_user_id,
    identifiant: target.identifiant,
    delete_after_simule: deleteAfter.toISOString(),
    preview: content,
  });
}
