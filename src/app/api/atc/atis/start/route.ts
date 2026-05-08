import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { fetchAtisBot, getAvailableBotInstance, getAllBotStatuses } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

/**
 * POST - Démarrer le broadcast ATIS sur un bot disponible.
 *
 * Multi-instance :
 *   - Le site peut auto-assigner le 1er bot libre, OU l'ATC peut cibler une
 *     instance precise via body.instance_id (utile si chaque bot a un canal
 *     vocal dedie, ex. "ATIS Mellor" sur Bot 1, "ATIS Refuge" sur Bot 2).
 *   - Un même aéroport ne peut être diffusé que par un seul bot à la fois.
 *   - L'ATC ne peut contrôler qu'un seul ATIS à la fois.
 *
 * Body :
 *   - aeroport (string, requis) : code ICAO
 *   - position (string, requis) : poste ATC (TWR, APP, ...)
 *   - instance_id (number, optionnel) : si fourni, force le bot cible (sinon auto)
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
    const { aeroport, position, instance_id: requestedInstance } = body as {
      aeroport?: string;
      position?: string;
      instance_id?: number | string;
    };
    if (!aeroport || !position) {
      return NextResponse.json({ error: 'aeroport et position requis' }, { status: 400 });
    }

    const aeroportCode = String(aeroport).toUpperCase();
    const admin = createAdminClient();

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

    // Vérification 2 : cet aéroport est-il déjà diffusé par un autre bot ?
    const { data: aeroBusy } = await admin
      .from('atis_broadcast_state')
      .select('id, controlling_user_id')
      .eq('aeroport', aeroportCode)
      .eq('broadcasting', true)
      .maybeSingle();
    if (aeroBusy) {
      return NextResponse.json(
        {
          error: `L'ATIS de ${aeroportCode} est déjà diffusé par un autre contrôleur.`,
        },
        { status: 409 }
      );
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
          { error: `Bot ATIS ${requested} introuvable. Vérifiez la configuration côté Render.` },
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

    // Patch les données ATIS de cette instance (aéroport).
    const apt = AEROPORTS_PTFS.find((a) => a.code === aeroportCode);
    const patchRes = await fetchAtisBot('/webhook/atis-data', {
      method: 'PATCH',
      body: { airport: aeroportCode, airport_name: apt?.nom ?? aeroport },
      instanceId: availableInstance,
    });
    if (patchRes.error && patchRes.status !== 503) {
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
      return NextResponse.json({ error: startRes.error }, { status: startRes.status });
    }

    // Met à jour la state row de cette instance.
    await admin.from('atis_broadcast_state').upsert(
      {
        id: String(availableInstance),
        controlling_user_id: user.id,
        aeroport: aeroportCode,
        position: String(position),
        broadcasting: true,
        source: 'site',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

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
