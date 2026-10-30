import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export const DEVELOPMENT_ACTIONS = new Set(['research_start', 'card_commit', 'card_discard', 'settings', 'dossier', 'codeshare_propose', 'codeshare_accept', 'codeshare_reject', 'codeshare_cancel']);
export function developmentError(error: { code?: string; message?: string } | null) {
  const missing = ['42P01', '42883', 'PGRST202', 'PGRST204'].includes(error?.code || '');
  const invalid = ['22P02', '22003', '23514', '23502'].includes(error?.code || '');
  return { message: missing ? 'Le développement des compagnies est en cours de mise en service.' : invalid ? 'Les paramètres transmis sont invalides.' : error?.code === '23505' ? 'Ce projet ou cet accord est déjà engagé.' : error?.message || 'Opération indisponible.', status: missing ? 503 : invalid ? 400 : error?.code === '42501' ? 403 : 409 };
}
export async function developmentDashboard(actor: string, company: string) {
  return createAdminClient().rpc('company_development_dashboard', { p_actor: actor, p_company: company });
}
