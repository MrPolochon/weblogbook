import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { warnUserOfInactivity, INACTIVITY_THRESHOLD_DAYS } from '@/lib/admin/inactivity-warning';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({
  user_ids: z.array(z.string().uuid()).optional(),
  /** Si true, ignore user_ids et avertit TOUS les inactifs sans avertissement actuel. */
  all_inactive: z.boolean().optional(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifie' }, { status: 401 }) } as const;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Reserve aux admins' }, { status: 403 }) } as const;
  }
  return { user } as const;
}

/**
 * POST /api/admin/inactivity/warn
 *
 * Body : { user_ids?: uuid[], all_inactive?: boolean }
 *
 * - Si `user_ids` : avertit ces utilisateurs (skip ceux deja warned/dm_failed pour ne pas double-DM).
 * - Si `all_inactive=true` : avertit tous les utilisateurs inactifs depuis >30j non encore avertis.
 *
 * Retourne le detail par utilisateur.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resoudre la liste des cibles
  let targetIds: string[] = [];

  /**
   * Helper : detecte une erreur Postgrest "colonne inactivity_* manquante"
   * (migration add_inactivity_warnings.sql non encore appliquee).
   */
  const isMissingMigrationError = (err: { code?: string; message?: string } | null) => {
    if (!err) return false;
    const code = err.code;
    const msg = (err.message ?? '').toLowerCase();
    return code === '42703' || code === 'PGRST204' || msg.includes('inactivity_');
  };

  if (parsed.data.all_inactive) {
    const seuilIso = new Date(Date.now() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [profilesRes, trackingRes, recentPlansRes, recentVolsRes] = await Promise.all([
      admin.from('profiles')
        .select('id, created_at, role, inactivity_warning_status')
        .neq('role', 'admin')
        .is('inactivity_warning_status', null),
      admin.from('user_login_tracking').select('user_id, last_login_at'),
      // Pilotes ayant déposé un plan récent → actifs malgré absence du dashboard
      admin.from('plans_vol').select('pilote_id').gte('created_at', seuilIso).not('pilote_id', 'is', null),
      // Pilotes ayant un vol validé récent
      admin.from('vols').select('pilote_id').gte('created_at', seuilIso).in('statut', ['validé', 'en_attente']).not('pilote_id', 'is', null),
    ]);

    if (profilesRes.error) {
      if (isMissingMigrationError(profilesRes.error)) {
        return NextResponse.json({
          error: 'Migration SQL non appliquee. Va sur Supabase > SQL Editor et execute le contenu de "supabase/add_inactivity_warnings.sql", puis reessaie.',
          code: 'MIGRATION_MISSING',
        }, { status: 503 });
      }
      return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
    }

    const profiles = profilesRes.data ?? [];
    const tracking = trackingRes.data ?? [];

    const lastByUser = new Map<string, string | null>();
    for (const t of tracking) lastByUser.set(t.user_id as string, t.last_login_at as string | null);

    // Pilotes actifs par activité de vol (plans + vols)
    const activeByFlight = new Set<string>();
    for (const p of recentPlansRes.data ?? []) activeByFlight.add(p.pilote_id as string);
    for (const v of recentVolsRes.data ?? []) activeByFlight.add(v.pilote_id as string);

    targetIds = profiles
      .filter((p) => {
        // Exclure les pilotes actifs par vol (même s'ils ne se sont pas connectés)
        if (activeByFlight.has(p.id as string)) return false;
        const last = lastByUser.get(p.id as string) ?? null;
        const ref = last ?? (p.created_at as string);
        return ref < seuilIso;
      })
      .map((p) => p.id as string);

    if (targetIds.length === 0) {
      return NextResponse.json({
        ok: true, warned: 0, failed: 0, results: [],
        message: `Aucun inactif (>${INACTIVITY_THRESHOLD_DAYS}j) sans avertissement actuel. Les ${profiles.length} comptes deja tous avertis ou recents.`,
      });
    }
  } else if (parsed.data.user_ids?.length) {
    const res = await admin
      .from('profiles')
      .select('id')
      .in('id', parsed.data.user_ids)
      .is('inactivity_warning_status', null);

    if (res.error) {
      if (isMissingMigrationError(res.error)) {
        return NextResponse.json({
          error: 'Migration SQL non appliquee. Va sur Supabase > SQL Editor et execute le contenu de "supabase/add_inactivity_warnings.sql", puis reessaie.',
          code: 'MIGRATION_MISSING',
        }, { status: 503 });
      }
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
    targetIds = (res.data ?? []).map((p) => p.id as string);

    if (targetIds.length === 0) {
      return NextResponse.json({
        ok: true, warned: 0, failed: 0, results: [],
        message: 'Ces utilisateurs ont deja un avertissement (statut warned ou dm_failed). Pour le ressayer, supprime d\'abord le statut en BDD.',
      });
    }
  } else {
    return NextResponse.json({
      error: 'Body invalide : fournir user_ids ou all_inactive=true',
    }, { status: 400 });
  }

  // Recuperer les identifiants pour personnaliser les DM
  const { data: profilesInfo } = await admin
    .from('profiles')
    .select('id, identifiant')
    .in('id', targetIds);

  const idtById = new Map<string, string | null>();
  for (const p of profilesInfo ?? []) idtById.set(p.id as string, (p.identifiant as string | null) ?? null);

  // Sequentiel pour ne pas saturer le bot Discord (rate limit)
  const results = [];
  let warned = 0;
  let failed = 0;
  for (const uid of targetIds) {
    const r = await warnUserOfInactivity(admin, uid, idtById.get(uid) ?? null);
    results.push(r);
    if (r.status === 'warned') warned++;
    else failed++;
  }

  return NextResponse.json({ ok: true, warned, failed, results });
}
