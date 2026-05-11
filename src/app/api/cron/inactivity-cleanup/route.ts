import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteUserAccount } from '@/lib/delete-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // jusqu'a 5 min pour deleter en batch

/**
 * Cron : supprime les comptes dont l'avertissement d'inactivite a expire
 * sans que l'utilisateur ne se reconnecte.
 *
 * A appeler quotidiennement (Vercel Cron, GitHub Actions, ou trigger manuel).
 *
 * Conditions de suppression (toutes requises) :
 *   - inactivity_warning_status = 'warned'
 *   - inactivity_delete_after < now()
 *   - last_login_at < inactivity_warned_at  (pas de reconnexion entre temps)
 *   - role != 'admin'  (les admins sont protegees, suppression manuelle uniquement)
 *
 * Securite : header `x-cron-secret` ou `Authorization: Bearer ...` doit
 * matcher CRON_SECRET (env). En dev (NODE_ENV != production), accepte
 * aussi `?dryRun=1` pour lister sans supprimer (toujours auth requise).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Lister les candidats a la suppression
  const { data: candidates, error: candidatesErr } = await admin
    .from('profiles')
    .select('id, identifiant, role, inactivity_warned_at, inactivity_delete_after')
    .eq('inactivity_warning_status', 'warned')
    .neq('role', 'admin')
    .lt('inactivity_delete_after', nowIso);

  if (candidatesErr) {
    return NextResponse.json({ error: candidatesErr.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, skipped: 0, message: 'Aucun compte a supprimer.' });
  }

  // 2. Verifier que personne ne s'est reconnecte entre warned_at et maintenant
  const ids = candidates.map((c) => c.id as string);
  const { data: tracking } = await admin
    .from('user_login_tracking')
    .select('user_id, last_login_at')
    .in('user_id', ids);

  const lastLoginByUser = new Map<string, string | null>();
  for (const t of tracking ?? []) lastLoginByUser.set(t.user_id as string, t.last_login_at as string | null);

  const toDelete: typeof candidates = [];
  const skipped: Array<{ id: string; identifiant: string | null; reason: string }> = [];

  for (const c of candidates) {
    const last = lastLoginByUser.get(c.id as string);
    const warnedAt = c.inactivity_warned_at as string;
    if (last && warnedAt && last >= warnedAt) {
      // Reconnexion apres l'avertissement -> reset et skip
      await admin
        .from('profiles')
        .update({
          inactivity_warning_status: null,
          inactivity_warning_error: null,
          inactivity_warned_at: null,
          inactivity_delete_after: null,
        })
        .eq('id', c.id);
      skipped.push({ id: c.id as string, identifiant: c.identifiant as string | null, reason: 'reconnexion apres avertissement' });
    } else {
      toDelete.push(c);
    }
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      would_delete: toDelete.map((c) => ({ id: c.id, identifiant: c.identifiant })),
      skipped,
    });
  }

  // 3. Suppression effective
  const deleted: Array<{ id: string; identifiant: string | null }> = [];
  const errors: Array<{ id: string; identifiant: string | null; error: string }> = [];

  for (const c of toDelete) {
    try {
      await deleteUserAccount(c.id as string);
      deleted.push({ id: c.id as string, identifiant: c.identifiant as string | null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      console.error(`[inactivity-cleanup] echec suppression ${c.identifiant}:`, e);
      errors.push({ id: c.id as string, identifiant: c.identifiant as string | null, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: deleted.length,
    skipped: skipped.length,
    failed: errors.length,
    details: { deleted, skipped, errors },
  });
}
