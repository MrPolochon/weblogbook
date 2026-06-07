import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAtisBot } from '@/lib/atis-bot-api';

/**
 * Delai (jours) accorde a l'utilisateur pour se reconnecter apres reception
 * du DM d'avertissement, avant suppression automatique du compte.
 */
export const INACTIVITY_DELETE_DELAY_DAYS = 14;

/**
 * Seuil d'inactivite (jours) avant qu'un compte soit considere comme "rouge".
 * L'ACTIVITE inclut : connexion site, dépôt de plan de vol, vol enregistré.
 * Doit etre coherent avec `isInactifSeuil` cote UI.
 * 60 jours pour éviter de flaguer des pilotes qui volent sans forcément
 * consulter leur dashboard tous les 30 jours.
 */
export const INACTIVITY_THRESHOLD_DAYS = 60;

export type WarnResult = {
  user_id: string;
  identifiant: string | null;
  status: 'warned' | 'dm_failed';
  error?: string;
};

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  ''
).replace(/\/$/, '');

function buildDmContent(identifiant: string | null, deleteAfter: Date): string {
  const dateStr = deleteAfter.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const name = identifiant ?? 'Pilote';
  return [
    `Salut ${name},`,
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
    '— Mixou Airlines / IFSA',
  ].filter(Boolean).join('\n');
}

/**
 * Recupere le discord_user_id d'un utilisateur (NULL si non lie ou bloque).
 */
async function getDiscordIdForUser(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('discord_links')
    .select('discord_user_id, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.discord_user_id) return null;
  if (data.status === 'temporary_block' || data.status === 'permanent_block') return null;
  return data.discord_user_id as string;
}

/**
 * Avertit un utilisateur de son inactivite via DM Discord.
 *
 * - Si le DM passe : marque profile.inactivity_warning_status = 'warned'
 *   et programme la suppression dans `INACTIVITY_DELETE_DELAY_DAYS`.
 * - Si pas de Discord lie ou DM echoue : marque 'dm_failed' avec le motif.
 *
 * Best-effort : ne throw jamais. Renvoie le resultat synthetique.
 */
export async function warnUserOfInactivity(
  admin: SupabaseClient,
  userId: string,
  identifiant: string | null
): Promise<WarnResult> {
  const discordId = await getDiscordIdForUser(admin, userId);
  if (!discordId) {
    const errorMsg = 'Aucun compte Discord lie (ou compte bloque)';
    await admin
      .from('profiles')
      .update({
        inactivity_warning_status: 'dm_failed',
        inactivity_warning_error: errorMsg,
        inactivity_warned_at: null,
        inactivity_delete_after: null,
      })
      .eq('id', userId);
    return { user_id: userId, identifiant, status: 'dm_failed', error: errorMsg };
  }

  const now = new Date();
  const deleteAfter = new Date(now.getTime() + INACTIVITY_DELETE_DELAY_DAYS * 24 * 60 * 60 * 1000);
  const content = buildDmContent(identifiant, deleteAfter);

  const dmRes = await fetchAtisBot<{ ok?: boolean }>('/webhook/dm', {
    method: 'POST',
    timeoutMs: 15000,
    body: {
      discord_user_id: discordId,
      title: 'Avis de suppression de compte pour inactivite',
      content,
      link: SITE_URL ? `${SITE_URL}/login` : null,
    },
  });

  if (dmRes.error) {
    await admin
      .from('profiles')
      .update({
        inactivity_warning_status: 'dm_failed',
        inactivity_warning_error: dmRes.error.slice(0, 500),
        inactivity_warned_at: null,
        inactivity_delete_after: null,
      })
      .eq('id', userId);
    return { user_id: userId, identifiant, status: 'dm_failed', error: dmRes.error };
  }

  await admin
    .from('profiles')
    .update({
      inactivity_warning_status: 'warned',
      inactivity_warning_error: null,
      inactivity_warned_at: now.toISOString(),
      inactivity_delete_after: deleteAfter.toISOString(),
    })
    .eq('id', userId);

  return { user_id: userId, identifiant, status: 'warned' };
}

/**
 * Reset les colonnes d'avertissement (a appeler quand l'utilisateur se reconnecte).
 * Best-effort.
 */
export async function resetInactivityWarning(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    await admin
      .from('profiles')
      .update({
        inactivity_warning_status: null,
        inactivity_warning_error: null,
        inactivity_warned_at: null,
        inactivity_delete_after: null,
      })
      .eq('id', userId)
      .not('inactivity_warning_status', 'is', null);
  } catch (e) {
    console.error('[inactivity] resetInactivityWarning:', e);
  }
}
