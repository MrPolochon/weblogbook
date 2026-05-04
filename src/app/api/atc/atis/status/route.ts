import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { getAllBotStatuses } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

interface StateRow {
  id: string;
  controlling_user_id: string | null;
  aeroport: string | null;
  position: string | null;
  broadcasting: boolean | null;
  source: string | null;
}

interface InstancePayload {
  instance_id: number;
  controlling_user_id: string | null;
  aeroport: string | null;
  position: string | null;
  broadcasting: boolean;
  source: string | null;
  atis_text: string | null;
  is_mine: boolean;
}

/**
 * GET - État du broadcast ATIS multi-instance.
 *
 * Renvoie :
 *   - instances : tableau d'objets, un par bot (instance 1, 2, ...).
 *     Chaque entrée combine la DB (atis_broadcast_state) et l'état temps réel du bot.
 *   - mine : la 1ère instance contrôlée par l'utilisateur (pour le bouton/ticker).
 *   - any_broadcasting : true si au moins une instance broadcast.
 *   - profil utilisateur (atis_ticker_visible, atis_code_auto_rotate).
 *
 * Champs legacy conservés pour rétrocompatibilité avec le composant actuel :
 *   broadcasting, controlling_user_id, aeroport, position, source, atis_text
 *   -> reflètent l'instance contrôlée par l'utilisateur (sinon, la 1ère qui broadcast).
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
      .select('role, atc, atis_ticker_visible, atis_code_auto_rotate')
      .eq('id', user.id)
      .single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const admin = createAdminClient();

    // Charge toutes les rows de state (ordre par id pour stabilité).
    let rows: StateRow[] = [];
    try {
      const { data } = await admin
        .from('atis_broadcast_state')
        .select('id, controlling_user_id, aeroport, position, broadcasting, source')
        .order('id');
      rows = (data ?? []) as StateRow[];
    } catch {
      // Tables manquantes : on retourne vide (sera géré côté UI)
    }

    // Récupère l'état temps réel de toutes les instances depuis le bot.
    const botStatuses = await getAllBotStatuses();
    const botByInstance = new Map<number, (typeof botStatuses.instances)[number]>();
    for (const b of botStatuses.instances) {
      botByInstance.set(b.instance_id, b);
    }

    const instances: InstancePayload[] = rows.map((row) => {
      const instance_id = parseInt(row.id, 10);
      const bot = botByInstance.get(instance_id);
      const isDiscordSource = row.source === 'discord';
      const broadcasting = isDiscordSource
        ? !!row.broadcasting
        : !!(row.broadcasting && bot?.broadcasting);

      return {
        instance_id,
        controlling_user_id: row.controlling_user_id,
        aeroport: row.aeroport,
        position: row.position,
        broadcasting,
        source: row.source,
        atis_text: bot?.atis_text ?? null,
        is_mine: row.controlling_user_id === user.id,
      };
    });

    // Trouve l'instance "mine" (contrôlée par l'utilisateur).
    const mine = instances.find((i) => i.is_mine) ?? null;
    // Sinon, la 1ère qui broadcast (pour info ticker des autres ATC).
    const fallback = instances.find((i) => i.broadcasting) ?? null;
    const focused = mine ?? fallback;

    const anyBroadcasting = instances.some((i) => i.broadcasting);

    return NextResponse.json({
      instances,
      mine,
      any_broadcasting: anyBroadcasting,
      // Champs legacy (compatibilité avec l'UI actuelle qui n'a pas encore migré).
      controlling_user_id: focused?.controlling_user_id ?? null,
      aeroport: focused?.aeroport ?? null,
      position: focused?.position ?? null,
      broadcasting: focused?.broadcasting ?? false,
      source: focused?.source ?? null,
      atis_text: focused?.atis_text ?? null,
      atis_ticker_visible: profile?.atis_ticker_visible ?? true,
      atis_code_auto_rotate: profile?.atis_code_auto_rotate ?? false,
    });
  } catch (e) {
    console.error('ATIS status:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
