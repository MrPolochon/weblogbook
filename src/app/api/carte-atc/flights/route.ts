import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAeroportBaseRetour } from '@/lib/reparation-after-ferry';

export const dynamic = 'force-dynamic';

/** Aligné sur le transit réparation automatique max (voir reparation-transit.ts). */
const TRANSIT_REP_MAX_MS = 4 * 60 * 60 * 1000;

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
  /** Déplacement vers / depuis une réparation externe — affichage orange sur l’ODW. */
  operationnel_reparation?: boolean;
}

type HangarJoin = { aeroport_code?: string | null };

function normalizeHangar(raw: unknown): string | null {
  const rh = raw as HangarJoin | HangarJoin[] | null | undefined;
  const h = Array.isArray(rh) ? rh[0] : rh;
  const code = h?.aeroport_code;
  return code ? String(code).trim().toUpperCase() : null;
}

function synthStartedAtFromRepairEta(isoEta: string | null | undefined): string {
  const t = isoEta ? new Date(isoEta).getTime() : NaN;
  if (!Number.isFinite(t)) return new Date(Date.now()).toISOString();
  const start = Math.max(0, t - TRANSIT_REP_MAX_MS);
  return new Date(start).toISOString();
}

function ferryRepairStartedAt(vol: {
  automatique?: boolean | null;
  fin_prevue_at?: string | null;
  duree_prevue_min?: number | null;
  duree_minutes?: number | null;
  created_at?: string | null;
}): string {
  const dur =
    typeof vol.duree_prevue_min === 'number' && vol.duree_prevue_min > 0 ? vol.duree_prevue_min
    : typeof vol.duree_minutes === 'number' && vol.duree_minutes > 0 ? vol.duree_minutes
    : null;
  if (vol.automatique && vol.fin_prevue_at && dur != null && dur > 0) {
    const fin = new Date(vol.fin_prevue_at).getTime();
    const s = fin - dur * 60_000;
    return new Date(Number.isFinite(s) ? s : Date.now()).toISOString();
  }
  const fin = vol.fin_prevue_at ? new Date(vol.fin_prevue_at).getTime() : NaN;
  const refDur = dur != null && dur > 0 ? dur : 180;
  if (Number.isFinite(fin)) {
    return new Date(fin - refDur * 60_000).toISOString();
  }
  return vol.created_at || new Date().toISOString();
}

export async function GET() {
  const admin = createAdminClient();

  const nowIso = new Date().toISOString();

  const [
    { data: plans },
    { data: militaryVols },
    { data: links },
    { data: repairDemandes },
    { data: ferriesActifs },
  ] = await Promise.all([
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
    admin
      .from('reparation_demandes')
      .select(
        'id, avion_id, statut, aeroport_depart_client, compagnie_id, entreprise_transit_eta_at, retour_transit_eta_at, reparation_hangars(aeroport_code)',
      )
      .in('statut', ['acceptee', 'en_transit', 'retour_transit']),
    admin
      .from('vols_ferry')
      .select(
        'id, avion_id, aeroport_depart, aeroport_arrivee, statut, automatique, fin_prevue_at, duree_prevue_min, duree_minutes, created_at, pilote_id',
      )
      .in('statut', ['planned', 'in_progress'])
      .neq('aeroport_depart', 'aeroport_arrivee')
      .not('aeroport_depart', 'is', null)
      .not('aeroport_arrivee', 'is', null),
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

  /** Ferry / acheminements liés aux entreprises de réparation (affichés en orange sur l’ODW). */
  type RepDemRow = {
    id: string;
    avion_id: string;
    statut: string;
    aeroport_depart_client: string | null;
    compagnie_id: string;
    entreprise_transit_eta_at: string | null;
    retour_transit_eta_at: string | null;
    reparation_hangars: unknown;
  };
  type FerryRow = {
    id: string;
    avion_id: string;
    aeroport_depart: string;
    aeroport_arrivee: string;
    statut: string;
    automatique?: boolean | null;
    fin_prevue_at?: string | null;
    duree_prevue_min?: number | null;
    duree_minutes?: number | null;
    created_at?: string | null;
    pilote_id?: string | null;
  };

  const repairRowsAll = (repairDemandes ?? []) as RepDemRow[];
  const ferriesRows = (ferriesActifs ?? []) as FerryRow[];

  const ferryByAvion = new Set<string>(ferriesRows.map((v) => v.avion_id).filter(Boolean));
  const avionIdsRepair = Array.from(new Set(repairRowsAll.map((r) => r.avion_id)));

  let avionMeta: { id: string; immatriculation: string | null; aeroport_actuel: string }[] = [];
  if (avionIdsRepair.length) {
    const { data: cav } = await admin
      .from('compagnie_avions')
      .select('id, immatriculation, aeroport_actuel')
      .in('id', avionIdsRepair);
    avionMeta = (cav || []) as typeof avionMeta;
  }

  const avMap = new Map(avionMeta.map((a) => [a.id, a]));

  const ferryPilotIds = Array.from(
    new Set(ferriesRows.map((f) => f.pilote_id).filter((id): id is string => Boolean(id))),
  );
  let pilotIdentById = new Map<string, string>();
  if (ferryPilotIds.length) {
    const { data: profs } = await admin.from('profiles').select('id, identifiant').in('id', ferryPilotIds);
    pilotIdentById = new Map(
      (profs || []).map((p) => [String(p.id), String(p.identifiant || '?')]),
    );
  }

  const hasRepairFerryHue = (avid: string) =>
    repairRowsAll.some((r) => r.avion_id === avid && (r.statut === 'acceptee' || r.statut === 'retour_transit'));

  for (const vf of ferriesRows) {
    if (!hasRepairFerryHue(vf.avion_id)) continue;
    const imm = avMap.get(vf.avion_id)?.immatriculation || vf.avion_id.slice(0, 6).toUpperCase();
    const pilId = vf.pilote_id ?? null;
    const dureeMin = Math.max(
      1,
      typeof vf.duree_prevue_min === 'number' && vf.duree_prevue_min > 0 ? vf.duree_prevue_min
        : typeof vf.duree_minutes === 'number' && vf.duree_minutes > 0 ? vf.duree_minutes : 180,
    );
    flights.push({
      id: `rep-ff-${vf.id}`,
      kind: 'civil',
      numero_vol: `REP-OPS ${imm}`,
      aeroport_depart: vf.aeroport_depart,
      aeroport_arrivee: vf.aeroport_arrivee,
      type_vol: 'IFR',
      temps_prev_min: dureeMin,
      started_at: ferryRepairStartedAt(vf),
      status: vf.statut,
      pilote_id: pilId,
      pilote_identifiant: pilId ? pilotIdentById.get(pilId) || null : null,
      discord_username: pilId ? discordByUser.get(pilId) ?? null : null,
      route: null,
      sid: null,
      star: null,
      operationnel_reparation: true,
    });
  }

  for (const rd of repairRowsAll) {
    const immShort = avMap.get(rd.avion_id)?.immatriculation || rd.avion_id.slice(0, 6).toUpperCase();

    if (rd.statut === 'en_transit' && rd.entreprise_transit_eta_at && !ferryByAvion.has(rd.avion_id)) {
      const hang = normalizeHangar(rd.reparation_hangars);
      const avRow = avMap.get(rd.avion_id);
      if (!hang || !avRow?.aeroport_actuel) continue;
      const dep = String(avRow.aeroport_actuel).trim().toUpperCase();
      if (dep === hang) continue;
      flights.push({
        id: `rep-tow-${rd.id}`,
        kind: 'civil',
        numero_vol: `REP-TOW ${immShort}`,
        aeroport_depart: dep,
        aeroport_arrivee: hang,
        type_vol: 'IFR',
        temps_prev_min: Math.round(TRANSIT_REP_MAX_MS / 60_000),
        started_at: synthStartedAtFromRepairEta(rd.entreprise_transit_eta_at),
        status: 'reparation_entreprise_transit',
        pilote_id: null,
        pilote_identifiant: 'Réparation externe',
        discord_username: null,
        route: null,
        sid: null,
        star: null,
        operationnel_reparation: true,
      });
      continue;
    }

    if (rd.statut === 'retour_transit' && rd.retour_transit_eta_at && !ferryByAvion.has(rd.avion_id)) {
      const hang = normalizeHangar(rd.reparation_hangars);
      const baseCible = await resolveAeroportBaseRetour(admin, {
        compagnie_id: rd.compagnie_id,
        aeroport_depart_client: rd.aeroport_depart_client ?? null,
      });
      if (!hang || !baseCible || hang === baseCible.toUpperCase()) continue;
      const arr = baseCible.toUpperCase();
      flights.push({
        id: `rep-ret-${rd.id}`,
        kind: 'civil',
        numero_vol: `REP-RTS ${immShort}`,
        aeroport_depart: hang,
        aeroport_arrivee: arr,
        type_vol: 'IFR',
        temps_prev_min: Math.round(TRANSIT_REP_MAX_MS / 60_000),
        started_at: synthStartedAtFromRepairEta(rd.retour_transit_eta_at),
        status: 'reparation_retour_transit',
        pilote_id: null,
        pilote_identifiant: 'Réparation externe',
        discord_username: null,
        route: null,
        sid: null,
        star: null,
        operationnel_reparation: true,
      });
    }
  }

  return NextResponse.json(flights);
}

