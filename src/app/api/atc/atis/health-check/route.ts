import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { fetchAtisBot, getBotOverview } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

interface CheckResult {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

interface BotHealth {
  ok: boolean;
  version?: string;
  uptime_seconds?: number;
  instances_configured?: number;
  instances_ready?: number[];
  manager_ready?: boolean;
  secret_loaded?: boolean;
}

/**
 * GET /api/atc/atis/health-check
 *
 * Diagnostique complet de l'integration ATIS multi-bot. Reserve aux admins.
 *
 * Verifie :
 *  1. Variables d'env (ATIS_WEBHOOK_URL, ATIS_WEBHOOK_SECRET).
 *  2. Bot Render joignable (/webhook/health).
 *  3. Toutes les instances configurees sont READY (Discord connecte).
 *  4. Lignes DB en place (atis_broadcast_state + atis_broadcast_config x N).
 *  5. Index unique partiel "1 aeroport = 1 bot" present.
 *  6. Config Discord (guild + channel) persistee pour chaque bot.
 *  7. Pas de "ghost broadcast" (DB dit broadcasting=true mais bot inactif).
 *  8. Coherence broadcasting DB <-> bot live.
 *
 * Renvoie un tableau de checks. status global = "ok" si tous ok, "warn" si
 * un warn et aucun fail, "fail" si au moins 1 fail.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin uniquement.' }, { status: 403 });
    }

    const checks: CheckResult[] = [];

    // -----------------------------------------------------------------------
    // 1. Variables d'env
    // -----------------------------------------------------------------------
    const hasUrl = Boolean(process.env.ATIS_WEBHOOK_URL?.trim());
    const hasSecret = Boolean(process.env.ATIS_WEBHOOK_SECRET?.trim());
    checks.push({
      id: 'env-vars',
      label: 'Variables d\'environnement (site)',
      status: hasUrl && hasSecret ? 'ok' : 'fail',
      message:
        hasUrl && hasSecret
          ? 'ATIS_WEBHOOK_URL et ATIS_WEBHOOK_SECRET définis.'
          : `Manquant : ${[!hasUrl && 'ATIS_WEBHOOK_URL', !hasSecret && 'ATIS_WEBHOOK_SECRET']
              .filter(Boolean)
              .join(', ')}. Définis-les dans Vercel.`,
    });

    // -----------------------------------------------------------------------
    // 2. Bot Render joignable
    // -----------------------------------------------------------------------
    let botHealth: BotHealth | null = null;
    let botLatencyMs: number | undefined;
    if (hasUrl && hasSecret) {
      const t0 = Date.now();
      const res = await fetchAtisBot<BotHealth>('/webhook/health', { timeoutMs: 30000 });
      botLatencyMs = res.latencyMs ?? Date.now() - t0;
      if (res.error || !res.data) {
        checks.push({
          id: 'bot-reachable',
          label: 'Bot Render joignable',
          status: 'fail',
          message: `Bot injoignable : ${res.error ?? 'pas de réponse'}. Cold start Render possible (réessayer dans 1–2 min).`,
          details: { latency_ms: botLatencyMs, status: res.status },
        });
      } else {
        botHealth = res.data;
        checks.push({
          id: 'bot-reachable',
          label: 'Bot Render joignable',
          status: 'ok',
          message: `Bot OK — v${botHealth.version ?? '?'} — uptime ${formatUptime(botHealth.uptime_seconds)} — ${botLatencyMs}ms.`,
          details: { latency_ms: botLatencyMs, version: botHealth.version, uptime_seconds: botHealth.uptime_seconds },
        });

        // 2.b. Secret cote bot
        checks.push({
          id: 'bot-secret',
          label: 'Secret partagé chargé côté bot',
          status: botHealth.secret_loaded ? 'ok' : 'fail',
          message: botHealth.secret_loaded
            ? 'Le bot a chargé ATIS_WEBHOOK_SECRET au démarrage.'
            : 'ATIS_WEBHOOK_SECRET non chargé côté bot — vérifie la variable Render et redémarre.',
        });

        // 2.c. Manager pret
        checks.push({
          id: 'bot-manager',
          label: 'Bot manager initialisé',
          status: botHealth.manager_ready ? 'ok' : 'fail',
          message: botHealth.manager_ready
            ? 'BotManager initialisé.'
            : 'BotManager pas encore prêt — soit cold start, soit aucun DISCORD_TOKEN.',
        });

        // 2.d. Instances ready
        const configured = botHealth.instances_configured ?? 0;
        const ready = botHealth.instances_ready ?? [];
        if (configured === 0) {
          checks.push({
            id: 'bot-instances',
            label: 'Instances bot configurées',
            status: 'fail',
            message: 'Aucune instance configurée. Définis DISCORD_TOKEN (et DISCORD_TOKEN_2) sur Render.',
          });
        } else {
          const allReady = ready.length === configured;
          checks.push({
            id: 'bot-instances',
            label: `Instances Discord prêtes`,
            status: allReady ? 'ok' : 'warn',
            message: allReady
              ? `${configured} instance(s) configurée(s), toutes prêtes : ${ready.join(', ')}.`
              : `${ready.length}/${configured} prêtes (${ready.join(', ') || 'aucune'}). Les autres sont peut-être encore en cours de connexion Discord.`,
            details: { configured, ready },
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Etat DB
    // -----------------------------------------------------------------------
    const adminDb = createAdminClient();

    const { data: stateRows, error: stateErr } = await adminDb
      .from('atis_broadcast_state')
      .select('id, broadcasting, aeroport, controlling_user_id, source, started_at')
      .order('id');
    const { data: configRows, error: configErr } = await adminDb
      .from('atis_broadcast_config')
      .select('id, discord_guild_id, discord_guild_name, discord_channel_id, discord_channel_name')
      .order('id');

    if (stateErr || configErr) {
      checks.push({
        id: 'db-tables',
        label: 'Tables Supabase (atis_broadcast_state/config)',
        status: 'fail',
        message: `Erreur de lecture : ${(stateErr ?? configErr)?.message ?? 'inconnue'}. Lance la migration supabase/add_atis_bot_instance_2.sql.`,
      });
    } else {
      const stateIds = new Set((stateRows ?? []).map((r) => r.id));
      const configIds = new Set((configRows ?? []).map((r) => r.id));
      const expectedIds =
        botHealth?.instances_configured && botHealth.instances_configured >= 2
          ? Array.from({ length: botHealth.instances_configured }, (_, i) => String(i + 1))
          : ['1', '2'];
      const missingState = expectedIds.filter((id) => !stateIds.has(id));
      const missingConfig = expectedIds.filter((id) => !configIds.has(id));
      const hasLegacy = stateIds.has('default') || configIds.has('default');

      if (hasLegacy) {
        checks.push({
          id: 'db-legacy',
          label: 'Migration legacy `default` -> `1`',
          status: 'fail',
          message: 'Lignes `default` détectées. Lance supabase/add_atis_bot_instance_2.sql pour migrer.',
        });
      } else if (missingState.length || missingConfig.length) {
        checks.push({
          id: 'db-rows',
          label: 'Lignes DB par instance',
          status: 'fail',
          message: `Manquant : state=${missingState.join(',') || '✓'} config=${missingConfig.join(',') || '✓'}. Lance supabase/add_atis_bot_instance_2.sql.`,
        });
      } else {
        checks.push({
          id: 'db-rows',
          label: 'Lignes DB par instance',
          status: 'ok',
          message: `Toutes les lignes attendues présentes (${expectedIds.join(', ')}).`,
        });
      }

      // 3.b. Config Discord par instance
      const configMissing: string[] = [];
      for (const c of configRows ?? []) {
        if (!c.discord_guild_id || !c.discord_channel_id) configMissing.push(c.id);
      }
      checks.push({
        id: 'discord-config',
        label: 'Config Discord (serveur + canal vocal)',
        status: configMissing.length === 0 ? 'ok' : 'warn',
        message:
          configMissing.length === 0
            ? 'Tous les bots ont un canal vocal assigné.'
            : `Bot(s) sans canal vocal : ${configMissing.join(', ')}. Configure-les depuis le panneau ATIS (onglet Config).`,
        details: {
          configured: (configRows ?? []).map((c) => ({
            instance_id: c.id,
            guild: c.discord_guild_name,
            channel: c.discord_channel_name,
          })),
        },
      });

      // 3.c. Coherence DB <-> bot (ghost broadcast)
      if (botHealth) {
        const overview = await getBotOverview();
        const botByInstance = new Map<number, { broadcasting: boolean }>();
        for (const b of overview.data?.instances ?? []) {
          botByInstance.set(b.instance_id, { broadcasting: b.broadcasting });
        }
        const ghosts: string[] = [];
        for (const r of stateRows ?? []) {
          if (r.broadcasting && r.source !== 'discord') {
            const id = parseInt(r.id, 10);
            const live = botByInstance.get(id);
            if (live && !live.broadcasting) ghosts.push(r.id);
          }
        }
        checks.push({
          id: 'ghost-broadcast',
          label: 'Cohérence DB ↔ bot live',
          status: ghosts.length === 0 ? 'ok' : 'warn',
          message:
            ghosts.length === 0
              ? 'Aucun broadcast fantôme.'
              : `Instances marquées broadcasting=true en DB mais bot inactif : ${ghosts.join(', ')}. Un STOP sur l'instance corrigera.`,
          details: { ghosts },
        });
      }
    }

    // -----------------------------------------------------------------------
    // Etat global
    // -----------------------------------------------------------------------
    const fail = checks.some((c) => c.status === 'fail');
    const warn = !fail && checks.some((c) => c.status === 'warn');
    const overallStatus: 'ok' | 'warn' | 'fail' = fail ? 'fail' : warn ? 'warn' : 'ok';

    return NextResponse.json({
      overall_status: overallStatus,
      checks,
      bot_latency_ms: botLatencyMs,
      bot_version: botHealth?.version,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('ATIS health-check:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds < 0) return '?';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}min`);
  return parts.join(' ');
}
