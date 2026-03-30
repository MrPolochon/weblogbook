import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type FlightKind = 'civil' | 'military';

interface MapFlight {
  id: string;
  kind: FlightKind;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: 'VFR' | 'IFR' | 'MIL';
  temps_prev_min: number;
  started_at: string;
  status: string;
  pilote_id: string | null;
  pilote_identifiant: string | null;
  discord_username: string | null;
  route: string | null;
  sid: string | null;
  star: string | null;
}

export async function GET() {
  const admin = createAdminClient();

  const nowIso = new Date().toISOString();

  const [{ data: plans }, { data: militaryVols }, { data: links }] = await Promise.all([
    admin
      .from('plans_vol')
      .select(`
        id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, temps_prev_min,
        statut, accepted_at, created_at, pilote_id, vol_sans_atc, current_holder_user_id,
        route_ifr, strip_route, strip_sid_atc, sid_depart, star_arrivee, strip_star,
        profiles!plans_vol_pilote_id_fkey(id, identifiant)
      `)
      .in('statut', ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'])
      .neq('aeroport_depart', 'aeroport_arrivee')
      .not('aeroport_depart', 'is', null)
      .not('aeroport_arrivee', 'is', null),
    admin
      .from('vols')
      .select(`
        id, callsign, aeroport_depart, aeroport_arrivee, duree_minutes, depart_utc, arrivee_utc, statut, pilote_id,
        profiles!vols_pilote_id_fkey(id, identifiant)
      `)
      .eq('type_vol', 'Vol militaire')
      .lte('depart_utc', nowIso)
      .neq('aeroport_depart', 'aeroport_arrivee')
      .not('aeroport_depart', 'is', null)
      .not('aeroport_arrivee', 'is', null),
    admin.from('discord_links').select('user_id, discord_username').eq('status', 'active'),
  ]);

  const discordByUser = new Map<string, string>();
  for (const link of links || []) {
    if (link.user_id && link.discord_username) {
      discordByUser.set(link.user_id, link.discord_username);
    }
  }

  const flights: MapFlight[] = [];

  for (const p of plans || []) {
    const isAuto = p.statut === 'automonitoring' || p.vol_sans_atc === true;
    const isAtcManaged = Boolean(p.current_holder_user_id);
    const isInFlight = p.statut === 'en_cours' || p.statut === 'en_attente_cloture';
    const shouldDisplay = isAuto || isAtcManaged || isInFlight;
    if (!shouldDisplay) continue;

    const rawProfile = p.profiles as unknown;
    const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
    const piloteId = p.pilote_id || null;
    const startAt = p.accepted_at || p.created_at || nowIso;
    flights.push({
      id: `pv-${p.id}`,
      kind: 'civil',
      numero_vol: p.numero_vol || 'N/A',
      aeroport_depart: p.aeroport_depart,
      aeroport_arrivee: p.aeroport_arrivee,
      type_vol: p.type_vol === 'VFR' ? 'VFR' : 'IFR',
      temps_prev_min: Math.max(1, Number(p.temps_prev_min || 1)),
      started_at: startAt,
      status: p.statut,
      pilote_id: piloteId,
      pilote_identifiant: (profile as { identifiant?: string } | null)?.identifiant || null,
      discord_username: piloteId ? (discordByUser.get(piloteId) || null) : null,
      route: p.strip_route || p.route_ifr || null,
      sid: p.strip_sid_atc || p.sid_depart || null,
      star: p.strip_star || p.star_arrivee || null,
    });
  }

  for (const m of militaryVols || []) {
    // Vol validé/refusé = traité/clôturé => ne pas afficher sur la carte.
    if (m.statut === 'validé' || m.statut === 'refusé') continue;
    // Si heure d'arrivée dépassée, on ne l'affiche plus.
    if (m.arrivee_utc && new Date(m.arrivee_utc).getTime() <= Date.now()) continue;

    const rawProfile = m.profiles as unknown;
    const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
    const piloteId = m.pilote_id || null;
    flights.push({
      id: `mil-${m.id}`,
      kind: 'military',
      numero_vol: m.callsign || `MIL-${m.id.slice(0, 6).toUpperCase()}`,
      aeroport_depart: m.aeroport_depart,
      aeroport_arrivee: m.aeroport_arrivee,
      type_vol: 'MIL',
      temps_prev_min: Math.max(1, Number(m.duree_minutes || 1)),
      started_at: m.depart_utc || nowIso,
      status: m.statut || 'validé',
      pilote_id: piloteId,
      pilote_identifiant: (profile as { identifiant?: string } | null)?.identifiant || null,
      discord_username: piloteId ? (discordByUser.get(piloteId) || null) : null,
      route: null,
      sid: null,
      star: null,
    });
  }

  return NextResponse.json(flights);
}

