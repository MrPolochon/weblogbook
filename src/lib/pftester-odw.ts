/** Tracker interne PFtesterODW — flux live filtré sur le serveur privé Mixou. */

export const PF_DEFAULT_SERVER_ID = 'FG6JU5NY';
export const PF_TRAFFIC_URL = 'https://api.project-flight.com/v3/traffic/fetch';
/** Flux live par serveur, le même que PFTracker : un protobuf à chaque mise à jour. */
export function pfTrafficServerWsUrl(serverId: string): string {
  return `wss://api.project-flight.com/v3/traffic/server/ws/${encodeURIComponent(serverId)}`;
}
export const PF_TILE_BASE = 'https://cdn.project-flight.com/tiles';
/**
 * Cache-bust Update 9.0 (29 août 2026).
 * PFTracker sert encore `cdn.project-flight.com/tiles/{z}/{x}/{y}.webp?v=1`
 * (mêmes octets / Last-Modified avril 2025 au 29/08 soir). On versionne
 * nos URLs proxy pour casser le cache navigateur `immutable` et le CDN Vercel.
 */
export const PF_TILE_CACHE_VERSION = '20260829';

export function pfTileProxyUrl(z: number, x: number, y: number): string {
  return `/api/pftester-odw/tiles/${z}/${x}/${y}?v=${PF_TILE_CACHE_VERSION}`;
}

/** Espace carte officielle PFTracker (OrthographicView, target [120, 67.5]). */
export const PF_MAP_W = 240;
export const PF_MAP_H = 135;
export const PF_MAP_CX = 120;
export const PF_MAP_CY = 67.5;
/**
 * Même conversion que PFTracker : map = 120 + 0.00072 * gameX, 67.5 + 0.00072 * gameY.
 * Update 9.0 : pas recalibré — le JS public PFTracker n’expose plus 0.00072,
 * et aucune mesure live vs tracker officiel n’a montré un décalage.
 */
export const PF_COORD_SCALE = 0.00072;
/** Déplacement minimum, en unités carte, pour retenir un nouveau point de trace. */
export const PF_TRAIL_MIN_STEP = 0.015;
/**
 * Distingue un vol d'un trou d'enregistrement (page fermée, worker down).
 * Sans plafond temporel, un dt de 1 min relie deux vrais points par une
 * corde — d'où les angles droits au lieu du virage réel.
 */
const TRAIL_GAP_FLOOR = 2.5;
const TRAIL_GAP_CEILING = 16;
const TRAIL_GAP_MAX_KT = 900;
/** Au-delà, ce n'est plus du live ~1 Hz. */
const TRAIL_GAP_MAX_DT_SEC = 12;
/** Un trou ne casse le trait que s'il dessinerait un vrai segment (pas un avion à l'arrêt). */
const TRAIL_HOLE_MIN_DIST = 0.25;

export function isTrailGap(distMap: number, dtSec: number): boolean {
  const dt = Math.max(0.5, dtSec);
  if (dt > TRAIL_GAP_MAX_DT_SEC && distMap > TRAIL_HOLE_MIN_DIST) return true;
  const maxBySpeed = (TRAIL_GAP_MAX_KT / 3600) * dt * 1852 * PF_COORD_SCALE * 1.5;
  return distMap > Math.min(TRAIL_GAP_CEILING, Math.max(TRAIL_GAP_FLOOR, maxBySpeed));
}
/**
 * Arbre de tuiles CDN : 2^z × 2^z sur 256 unités.
 * L’espace avion / viewport reste 240×135 (fenêtre utile de cet arbre).
 * Ne pas placer les tuiles avec 240/2^z — ça décale tout vers l’est.
 */
export const PF_TILE_TREE = 256;

/** Côté d’une tuile à ce zoom, dans les mêmes unités que gameToMap. */
export function pfTileUnit(tileZoom: number): number {
  return PF_TILE_TREE / 2 ** tileZoom;
}

export const PF_SERVER_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** Paliers FL : la couleur change en continu entre chaque borne. */
const TRAIL_COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [220, 38, 38]],
  [5, [249, 115, 22]],
  [10, [34, 197, 94]],
  [30, [56, 189, 248]],
  [70, [14, 165, 233]],
  [120, [59, 130, 246]],
  [180, [37, 99, 235]],
  [250, [99, 102, 241]],
  [320, [139, 92, 246]],
  [400, [59, 7, 100]],
];

/** Trace : rouge sous le FL005 → orange → vert → bleu clair, puis plus sombre en haute. */
export function altitudeToTrailColor(altitudeFt: number): string {
  const fl = Math.max(0, altitudeFt / 100);
  const last = TRAIL_COLOR_STOPS[TRAIL_COLOR_STOPS.length - 1]!;
  if (fl >= last[0]) return `rgb(${last[1].join(',')})`;
  let i = 0;
  while (i < TRAIL_COLOR_STOPS.length - 1 && fl > TRAIL_COLOR_STOPS[i + 1]![0]) i++;
  const [f0, c0] = TRAIL_COLOR_STOPS[i]!;
  const [f1, c1] = TRAIL_COLOR_STOPS[i + 1]!;
  const t = (fl - f0) / Math.max(0.001, f1 - f0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
  return `rgb(${r},${g},${b})`;
}

export type PfLiveAircraft = {
  id: string;
  serverId: string;
  callsign: string;
  robloxUsername: string;
  x: number;
  y: number;
  heading: number;
  altitude: number;
  speed: number;
  model: string;
  livery: string;
  mapX: number;
  mapY: number;
};

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let n = 0;
  let shift = 0;
  let b: number;
  do {
    if (pos >= buf.length) return [n, pos];
    b = buf[pos++]!;
    n += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return [n, pos];
}

function readString(buf: Uint8Array, pos: number): [string, number] {
  const [len, p2] = readVarint(buf, pos);
  const end = Math.min(buf.length, p2 + len);
  return [new TextDecoder().decode(buf.subarray(p2, end)), end];
}

function readDoubleLE(buf: Uint8Array, pos: number): number {
  if (pos + 8 > buf.byteLength) return 0;
  return new DataView(buf.buffer, buf.byteOffset + pos, 8).getFloat64(0, true);
}

function skipField(buf: Uint8Array, pos: number, wireType: number): number {
  if (wireType === 0) {
    const [, next] = readVarint(buf, pos);
    return next;
  }
  if (wireType === 1) return pos + 8;
  if (wireType === 5) return pos + 4;
  if (wireType === 2) {
    const [len, next] = readVarint(buf, pos);
    return next + len;
  }
  return buf.length;
}

function decodePlane(buf: Uint8Array, start: number, end: number): Omit<PfLiveAircraft, 'id' | 'mapX' | 'mapY'> {
  let pos = start;
  const plane = {
    serverId: '',
    callsign: '',
    robloxUsername: '',
    x: 0,
    y: 0,
    heading: 0,
    altitude: 0,
    speed: 0,
    model: '',
    livery: '',
  };
  while (pos < end) {
    const [tag, p2] = readVarint(buf, pos);
    pos = p2;
    const field = tag >>> 3;
    const wt = tag & 7;
    if (wt === 2) {
      const [s, next] = readString(buf, pos);
      pos = next;
      if (field === 1) plane.serverId = s;
      else if (field === 2) plane.callsign = s;
      else if (field === 3) plane.robloxUsername = s;
      else if (field === 9) plane.model = s;
      else if (field === 10) plane.livery = s;
    } else if (wt === 1) {
      const v = readDoubleLE(buf, pos);
      pos += 8;
      if (field === 4) plane.x = v;
      else if (field === 5) plane.y = v;
      else if (field === 6) plane.heading = v;
      else if (field === 7) plane.altitude = v;
      else if (field === 8) plane.speed = v;
    } else {
      pos = skipField(buf, pos, wt);
    }
  }
  return plane;
}

export function gameToMap(x: number, y: number): { mapX: number; mapY: number } {
  return {
    mapX: PF_MAP_CX + PF_COORD_SCALE * x,
    mapY: PF_MAP_CY + PF_COORD_SCALE * y,
  };
}

export function decodeMultiPlanes(buf: Uint8Array): PfLiveAircraft[] {
  const planes: PfLiveAircraft[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const [tag, p2] = readVarint(buf, pos);
    pos = p2;
    const field = tag >>> 3;
    const wt = tag & 7;
    if (wt === 2 && field === 1) {
      const [len, p3] = readVarint(buf, pos);
      pos = p3;
      const raw = decodePlane(buf, pos, pos + len);
      pos += len;
      const { mapX, mapY } = gameToMap(raw.x, raw.y);
      const id = raw.robloxUsername
        ? `${raw.robloxUsername}:${raw.callsign || planes.length}`
        : `${raw.serverId}-${raw.callsign}-${planes.length}`;
      planes.push({ ...raw, id, mapX, mapY });
      continue;
    }
    pos = skipField(buf, pos, wt);
  }
  return planes;
}

/** Identité d'un vol, partagée par le worker d'enregistrement et la carte. */
export function pfFlightKey(robloxUsername: string, callsign: string): string {
  return `${(robloxUsername || '').trim()}::${(callsign || '').trim()}`;
}

export function normalizeServerId(raw: string | null | undefined): string {
  const id = (raw ?? '').trim();
  if (!PF_SERVER_ID_RE.test(id)) return PF_DEFAULT_SERVER_ID;
  return id;
}

export function configuredServerId(): string {
  return normalizeServerId(process.env.PF_PRIVATE_SERVER_ID || PF_DEFAULT_SERVER_ID);
}

let trafficCache: { at: number; planes: PfLiveAircraft[] } | null = null;
/** Micro-cache par instance : absorbe plusieurs onglets sans jamais figer une position. */
const TRAFFIC_TTL_MS = 900;

export const PF_TRAFFIC_HEADERS = {
  Accept: 'application/x-protobuf, application/octet-stream, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Referer: 'https://tracker.project-flight.com/',
  Origin: 'https://tracker.project-flight.com',
};

export function looksLikeProtobuf(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;
  const first = buf[0]!;
  if (first === 0x7b || first === 0x3c) return false;
  return (first & 7) === 2;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const PF_FETCH_TIMEOUT_MS = 8_000;

async function pullLiveTrafficBytes(): Promise<Uint8Array> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        PF_TRAFFIC_URL,
        { cache: 'no-store', headers: PF_TRAFFIC_HEADERS },
        PF_FETCH_TIMEOUT_MS,
      );
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (aborted) throw new Error('Flux trafic indisponible (timeout)');
      throw err;
    }
    lastStatus = res.status;
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!looksLikeProtobuf(buf)) {
        throw new Error('Flux trafic illisible');
      }
      return buf;
    }
    if (res.status !== 429 && res.status !== 502 && res.status !== 503) {
      throw new Error(`Flux trafic indisponible (${res.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw new Error(`Flux trafic indisponible (${lastStatus})`);
}

export async function fetchLiveTrafficResult(): Promise<{
  planes: PfLiveAircraft[];
  fetchedAt: number;
  decoded: number;
}> {
  const now = Date.now();
  if (trafficCache && now - trafficCache.at < TRAFFIC_TTL_MS) {
    return {
      planes: trafficCache.planes,
      fetchedAt: trafficCache.at,
      decoded: trafficCache.planes.length,
    };
  }

  const buf = await pullLiveTrafficBytes();
  const planes = decodeMultiPlanes(buf);
  if (planes.length === 0 && buf.length > 64) {
    throw new Error('Décodeur trafic vide');
  }
  trafficCache = { at: Date.now(), planes };
  return { planes, fetchedAt: trafficCache.at, decoded: planes.length };
}

export async function fetchLiveTraffic(): Promise<PfLiveAircraft[]> {
  const { planes } = await fetchLiveTrafficResult();
  return planes;
}

function planeFreshness(p: PfLiveAircraft): number {
  const moving = p.speed >= 40 ? 2 : p.speed >= 12 ? 1 : 0;
  const airborne = p.altitude >= 200 ? 1 : 0;
  return moving * 1000 + airborne * 100 + p.speed + p.altitude / 50;
}

/** Doublon exact (même pilote + même callsign). Deux vols distincts du même compte restent visibles. */
export function dedupeByPilot(planes: PfLiveAircraft[]): PfLiveAircraft[] {
  const byKey = new Map<string, PfLiveAircraft>();
  for (const p of planes) {
    const user = (p.robloxUsername || `${p.serverId}`).toLowerCase();
    const cs = (p.callsign || '').toLowerCase();
    const key = `${user}::${cs}`;
    const prev = byKey.get(key);
    if (!prev || planeFreshness(p) > planeFreshness(prev)) byKey.set(key, p);
  }
  return [...byKey.values()];
}

function dropInactiveClones(planes: PfLiveAircraft[]): PfLiveAircraft[] {
  const byUser = new Map<string, PfLiveAircraft[]>();
  for (const p of planes) {
    const key = (p.robloxUsername || p.id).toLowerCase();
    const list = byUser.get(key) ?? [];
    list.push(p);
    byUser.set(key, list);
  }
  const out: PfLiveAircraft[] = [];
  for (const list of byUser.values()) {
    if (list.length === 1) {
      out.push(list[0]!);
      continue;
    }
    const live = list.filter((p) => p.speed >= 30 || p.altitude >= 400);
    out.push(...(live.length ? live : list));
  }
  return out;
}

export function filterByServer(planes: PfLiveAircraft[], serverId: string): PfLiveAircraft[] {
  const wanted = serverId.toLowerCase();
  return dropInactiveClones(dedupeByPilot(planes.filter((p) => p.serverId.toLowerCase() === wanted)));
}
