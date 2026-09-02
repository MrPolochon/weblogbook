import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { fetchAtisBot, getAvailableBotInstance, getAllBotStatuses } from '@/lib/atis-bot-api';
import {
  atisKindForPosition,
  buildAtisPatchBody,
  firOf,
  identifiantFromJoin,
  isAtisDraftReady,
  resolveAtisEntitlement,
  type AtisDraftFields,
  type OnlineAtcSession,
  type TmaAirportDraft,
} from '@/lib/atis-priority';

export const dynamic = 'force-dynamic';
// Railway peut mettre quelques secondes a repondre lors d'un redeploi. On etend
// la limite Vercel a 60s pour eviter qu'un delai coupe l'orchestration
// avant qu'on ait pu ecrire le DB row de l'utilisateur (cause des etats zombie).
export const maxDuration = 60;

/**
 * POST - Démarrer le broadcast ATIS sur un bot disponible.
 *
 * Multi-instance :
 *   - Le site peut auto-assigner le 1er bot libre, OU l'ATC peut cibler une
 *     instance precise via body.instance_id (utile si chaque bot a un canal
 *     vocal dedie, ex. "ATIS Mellor" sur Bot 1, "ATIS Refuge" sur Bot 2).
 *   - Un ATIS aéroport (TWR/Sol/DEL) et un ATIS TMA (DEP/APP/Centre) peuvent
 *     coexister. Un seul contrôleur prioritaire configure chaque type.
 *   - L'ATC ne peut contrôler qu'un seul ATIS à la fois.
 *
 * Body :
 *   - aeroport (string, requis) : code ICAO
 *   - position (string, requis) : poste ATC (Tower, DEP, ...)
 *   - instance_id (number, optionnel) : si fourni, force le bot cible (sinon auto)
 *   - atis_payload (object, optionnel) : brouillon préparé avant diffusion
 *   - tma_airports (array, optionnel) : pistes TMA par aéroport
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, atc')
      .eq('id', user.id)
      .single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const body = await request.json();
    const {
      aeroport,
      position,
      instance_id: requestedInstance,
      atis_payload,
      tma_airports,
    } = body as {
      aeroport?: string;
      position?: string;
      instance_id?: number | string;
      atis_payload?: AtisDraftFields;
      tma_airports?: TmaAirportDraft[];
    };
    const admin = createAdminClient();
    const { data: mySession } = await admin
      .from('atc_sessions')
      .select('aeroport, position')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mySession?.aeroport || !mySession?.position) {
      return NextResponse.json(
        { error: 'Mettez-vous en service avant de diffuser un ATIS.' },
        { status: 403 }
      );
    }

    const aeroportCode = String(mySession.aeroport).toUpperCase();
    const positionName = String(mySession.position);
    if (aeroport && String(aeroport).toUpperCase() !== aeroportCode) {
      return NextResponse.json(
        { error: 'L’ATIS doit correspondre à votre aéroport de session.' },
        { status: 403 }
      );
    }
    if (position && String(position) !== positionName) {
      return NextResponse.json(
        { error: 'L’ATIS doit correspondre à votre poste en service.' },
        { status: 403 }
      );
    }

    const incomingKind = atisKindForPosition(positionName);

    const { data: sessionRows } = await admin
      .from('atc_sessions')
      .select('user_id, aeroport, position, profiles!atc_sessions_user_id_fkey(identifiant)');
    const onlineSessions: OnlineAtcSession[] = (sessionRows ?? []).map((s) => ({
      user_id: s.user_id as string,
      aeroport: String(s.aeroport ?? ''),
      position: String(s.position ?? ''),
      identifiant: identifiantFromJoin((s as { profiles?: unknown }).profiles),
    }));
    const entitlement = resolveAtisEntitlement(user.id, aeroportCode, positionName, onlineSessions);
    if (!entitlement.can_configure) {
      return NextResponse.json(
        { error: entitlement.reason ?? 'Un contrôleur plus prioritaire configure déjà cet ATIS.' },
        { status: 403 }
      );
    }

    const tmaAirports = Array.isArray(tma_airports) ? tma_airports : [];
    if (!isAtisDraftReady(incomingKind, atis_payload?.runway, tmaAirports)) {
      return NextResponse.json(
        {
          error:
            incomingKind === 'tma'
              ? 'Préparez d’abord l’ATIS TMA : indiquez au moins une piste en service sur un aéroport.'
              : 'Préparez d’abord l’ATIS : renseignez la piste en service.',
        },
        { status: 400 }
      );
    }

    // Vérification 1 : l'utilisateur ne contrôle-t-il pas déjà un ATIS ?
    const { data: userOwned } = await admin
      .from('atis_broadcast_state')
      .select('id, broadcasting, aeroport')
      .eq('controlling_user_id', user.id)
      .eq('broadcasting', true)
      .maybeSingle();
    if (userOwned) {
      return NextResponse.json(
        {
          error: `Vous contrôlez déjà l'ATIS de ${userOwned.aeroport ?? '?'}. Arrêtez-le avant d'en démarrer un autre.`,
        },
        { status: 409 }
      );
    }

    // Vérification 2 : même type d'ATIS déjà diffusé (aéroport vs TMA peuvent coexister).
    const { data: busyRows } = await admin
      .from('atis_broadcast_state')
      .select('id, controlling_user_id, aeroport, position')
      .eq('broadcasting', true);
    const incomingFir = firOf(aeroportCode);
    const conflict = (busyRows ?? []).find((row) => {
      const rowKind = atisKindForPosition(String(row.position ?? ''));
      if (rowKind !== incomingKind) return false;
      if (incomingKind === 'airport') {
        return String(row.aeroport ?? '').toUpperCase() === aeroportCode;
      }
      return Boolean(incomingFir && firOf(String(row.aeroport ?? '')) === incomingFir);
    });
    if (conflict) {
      return NextResponse.json(
        {
          error:
            incomingKind === 'tma'
              ? `L'ATIS TMA ${incomingFir ?? aeroportCode} est déjà diffusé.`
              : `L'ATIS de ${aeroportCode} est déjà diffusé par un autre contrôleur.`,
        },
        { status: 409 }
      );
    }

    // Vérification 3 : état réel des bots (si la DB est désynchronisée, un flux peut
    // encore être actif alors que broadcasting=false côté Supabase).
    const { instances: liveStatuses, error: liveErr } = await getAllBotStatuses();
    if (!liveErr && liveStatuses.length > 0 && incomingKind === 'airport') {
      const stillLive = liveStatuses.find((i) => {
        if (!i.broadcasting) return false;
        const liveIcao = String(i.airport ?? '')
          .trim()
          .toUpperCase();
        if (liveIcao !== aeroportCode) return false;
        const dbRow = (busyRows ?? []).find((r) => String(r.id) === String(i.instance_id));
        const liveKind = atisKindForPosition(String(dbRow?.position ?? ''));
        return liveKind === 'airport' || !dbRow?.position;
      });
      if (stillLive) {
        return NextResponse.json(
          {
            error: `Le bot ${stillLive.instance_id} diffuse encore l’ATIS de ${stillLive.airport ?? aeroportCode} (état réel Discord). Dans le panneau ATIS, onglet Diffuser — cliquez « Stop » à droite de cette instance (pas seulement « Démarrer ») pour couper le flux, puis relancez.`,
          },
          { status: 409 }
        );
      }
    }

    // Resolution de l'instance cible : explicit (body.instance_id) ou auto.
    let availableInstance: number | null = null;

    if (requestedInstance !== undefined && requestedInstance !== null && requestedInstance !== '') {
      const requested = parseInt(String(requestedInstance), 10);
      if (!Number.isFinite(requested) || requested < 1) {
        return NextResponse.json({ error: 'instance_id invalide' }, { status: 400 });
      }
      // Verifie que ce bot existe et qu'il n'est pas deja en broadcast.
      const { instances, error: statusErr } = await getAllBotStatuses();
      if (statusErr) {
        return NextResponse.json({ error: statusErr }, { status: 503 });
      }
      const target = instances.find((i) => i.instance_id === requested);
      if (!target) {
        return NextResponse.json(
          { error: `Bot ATIS ${requested} introuvable. Vérifiez la configuration côté Railway.` },
          { status: 400 }
        );
      }
      if (target.broadcasting) {
        return NextResponse.json(
          {
            error: `Le Bot ${requested} diffuse déjà l'ATIS de ${target.airport ?? '?'}. Choisissez un autre bot.`,
          },
          { status: 409 }
        );
      }
      availableInstance = requested;
    } else {
      // Auto-assign : on demande au bot quelle instance est libre.
      const { instance_id, error: availableErr } = await getAvailableBotInstance();
      if (availableErr) {
        return NextResponse.json({ error: availableErr }, { status: 503 });
      }
      if (!instance_id) {
        return NextResponse.json(
          {
            error: 'Tous les bots ATIS sont déjà actifs. Réessayez plus tard ou demandez à un autre ATC d\'arrêter le sien.',
          },
          { status: 409 }
        );
      }
      availableInstance = instance_id;
    }

    // Récupère la config Discord (guild + canal) de cette instance.
    const { data: config } = await admin
      .from('atis_broadcast_config')
      .select('discord_guild_id, discord_channel_id')
      .eq('id', String(availableInstance))
      .maybeSingle();
    const guildId = config?.discord_guild_id;
    const channelId = config?.discord_channel_id;
    if (!guildId || !channelId) {
      return NextResponse.json(
        {
          error: `Sélectionnez un serveur Discord et un canal vocal dans le panneau ATIS (instance ${availableInstance}) avant de démarrer.`,
        },
        { status: 400 }
      );
    }

    // ETAPE CRITIQUE : on ecrit le DB row AVANT d'appeler le bot.
    // Raison : si Railway est lent (redeploi) et que Vercel coupe la fonction
    // a 60s, le bot peut quand meme avoir demarre derriere mais on aurait
    // perdu l'info "qui controle". En ecrivant d'abord, on a au moins le
    // bon controlling_user_id si le timeout survient.
    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await admin.from('atis_broadcast_state').upsert(
      {
        id: String(availableInstance),
        controlling_user_id: user.id,
        aeroport: aeroportCode,
        position: positionName,
        broadcasting: true,
        source: 'site',
        started_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );
    if (upsertErr) {
      console.error('ATIS start upsert error:', upsertErr);
      // Expose le vrai message Supabase pour faciliter le debug.
      return NextResponse.json(
        {
          error: `Erreur DB lors de la prise de controle: ${upsertErr.message}`,
          code: upsertErr.code,
          details: upsertErr.details,
          hint: upsertErr.hint,
        },
        { status: 500 }
      );
    }

    // Patch les données ATIS de cette instance AVANT le start (config puis diffusion).
    const apt = AEROPORTS_PTFS.find((a) => a.code === aeroportCode);
    const patchBody = buildAtisPatchBody({
      aeroport: aeroportCode,
      kind: incomingKind,
      fir: entitlement.fir,
      draft: {
        ...(atis_payload ?? {}),
        runway: atis_payload?.runway ?? (incomingKind === 'airport' ? undefined : atis_payload?.runway),
      },
      tmaAirports,
    });
    if (!patchBody.airport_name) patchBody.airport_name = apt?.nom ?? aeroport;
    const patchRes = await fetchAtisBot('/webhook/atis-data', {
      method: 'PATCH',
      body: patchBody,
      instanceId: availableInstance,
    });
    if (patchRes.error && patchRes.status !== 503) {
      // Revert DB pour ne pas laisser de fausse "ownership".
      await admin
        .from('atis_broadcast_state')
        .update({
          controlling_user_id: null,
          aeroport: null,
          position: null,
          broadcasting: false,
          source: null,
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(availableInstance));
      return NextResponse.json({ error: patchRes.error }, { status: patchRes.status });
    }

    // Démarre le broadcast sur cette instance.
    const startRes = await fetchAtisBot<{
      ok: boolean;
      broadcasting: boolean;
      guild_name?: string;
      channel_name?: string;
    }>('/webhook/start', {
      method: 'POST',
      body: { guild_id: guildId, channel_id: channelId },
      instanceId: availableInstance,
    });
    if (startRes.error) {
      // Revert DB pour eviter le zombie inverse (DB pense broadcast, bot non).
      await admin
        .from('atis_broadcast_state')
        .update({
          controlling_user_id: null,
          aeroport: null,
          position: null,
          broadcasting: false,
          source: null,
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(availableInstance));
      return NextResponse.json({ error: startRes.error }, { status: startRes.status });
    }

    return NextResponse.json({
      ok: true,
      broadcasting: true,
      instance_id: availableInstance,
      guild_name: startRes.data?.guild_name,
      channel_name: startRes.data?.channel_name,
    });
  } catch (e) {
    console.error('ATIS start:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
