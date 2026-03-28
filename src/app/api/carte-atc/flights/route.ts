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
}

export async function GET() {
  const admin = createAdminClient();

  const nowIso = new Date().toISOString();

  const [{ data: plans }, { data: militaryVols }, { data: links }] = await Promise.all([
    admin
      .from('plans_vol')
      .select(`
        id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, temps_prev_min,
        statut, accepted_at, pilote_id, vol_sans_atc,
        profiles!plans_vol_pilote_id_fkey(id, identifiant)
      `)
      .in('statut', ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'])
      .not('accepted_at', 'is', null)
      .or('vol_sans_atc.is.null,vol_sans_atc.eq.false')
      .neq('aeroport_depart', 'aeroport_arrivee')
      .not('aeroport_depart', 'is', null)
      .not('aeroport_arrivee', 'is', null),
    admin
      .from('vols')
      .select(`
        id, callsign, aeroport_depart, aeroport_arrivee, duree_minutes, depart_utc, statut, pilote_id,
        profiles!vols_pilote_id_fkey(id, identifiant)
      `)
      .eq('type_vol', 'Vol militaire')
      .eq('statut', 'validé')
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
    const rawProfile = p.profiles as unknown;
    const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
    const piloteId = p.pilote_id || null;
    flights.push({
      id: `pv-${p.id}`,
      kind: 'civil',
      numero_vol: p.numero_vol || 'N/A',
      aeroport_depart: p.aeroport_depart,
      aeroport_arrivee: p.aeroport_arrivee,
      type_vol: p.type_vol === 'VFR' ? 'VFR' : 'IFR',
      temps_prev_min: Math.max(1, Number(p.temps_prev_min || 1)),
      started_at: p.accepted_at,
      status: p.statut,
      pilote_id: piloteId,
      pilote_identifiant: (profile as { identifiant?: string } | null)?.identifiant || null,
      discord_username: piloteId ? (discordByUser.get(piloteId) || null) : null,
    });
  }

  for (const m of militaryVols || []) {
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
    });
  }

  return NextResponse.json(flights);
}

