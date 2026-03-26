'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { RefreshCw, Radio } from 'lucide-react';

interface AtcSession {
  aeroport: string;
  position: string;
  started_at: string;
  callsign: string | null;
}

interface Island {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  fill: string;
  stroke: string;
}

interface FIRZone {
  id: string;
  code: string;
  name: string;
  points: { x: number; y: number }[];
  color: string;
  borderColor: string;
}

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  'ITKO': { x: 31.4, y: 20.1 },
  'IPPH': { x: 67.3, y: 22.9 },
  'ILKL': { x: 71.8, y: 26.3 },
  'IGRV': { x: 5.7, y: 40.7 },
  'ISAU': { x: 7.5, y: 87.5 },
  'IBTH': { x: 44.0, y: 43.3 },
  'IMLR': { x: 35.3, y: 54.5 },
  'IBLT': { x: 41.0, y: 61.9 },
  'IRFD': { x: 51.0, y: 66.3 },
  'IGAR': { x: 36.1, y: 70.7 },
  'ITRC': { x: 50.1, y: 79.0 },
  'ISCM': { x: 83.5, y: 43.1 },
  'IZOL': { x: 92.8, y: 55.4 },
  'IJAF': { x: 94.0, y: 45.9 },
  'ISKP': { x: 71.2, y: 56.9 },
  'ILAR': { x: 78.8, y: 82.2 },
  'IPAP': { x: 84.7, y: 86.8 },
  'IBAR': { x: 82.5, y: 90.2 },
  'IHEN': { x: 70.6, y: 91.8 },
  'IIAB': { x: 77.5, y: 93.2 },
  'IUFO': { x: 48.5, y: 41.7 },
};

const AIRPORT_NAMES: Record<string, string> = {
  'ITKO': 'Tokyo Intl.',
  'IPPH': 'Perth Intl.',
  'ILKL': 'Lukla',
  'IGRV': 'Grindavik',
  'ISAU': 'Sauthemptona',
  'IBTH': 'St Barthelemy',
  'IMLR': 'Mellor Intl.',
  'IBLT': 'Boltic',
  'IRFD': 'Greater Rockford',
  'IGAR': 'Air Base Garry',
  'ITRC': 'Training Centre',
  'ISCM': 'RAF Scampton',
  'IZOL': 'Izolirani Intl.',
  'IJAF': 'Al Najaf',
  'ISKP': 'Skopelos',
  'ILAR': 'Larnaca Intl.',
  'IPAP': 'Paphos Intl.',
  'IBAR': 'Barra',
  'IHEN': 'Henstridge',
  'IIAB': 'McConnell AFB',
  'IUFO': 'UFO Base',
};

const DEFAULT_ISLANDS: Island[] = [
  { id: 'rockford_east', name: 'Rockford east', points: [{ x: 466, y: 550 }, { x: 492, y: 582 }, { x: 499, y: 610 }, { x: 502, y: 631 }, { x: 513, y: 635 }, { x: 525, y: 629 }, { x: 524, y: 614 }, { x: 514, y: 600 }, { x: 511, y: 589 }, { x: 516, y: 581 }, { x: 527, y: 572 }, { x: 527, y: 563 }, { x: 521, y: 556 }, { x: 529, y: 540 }, { x: 536, y: 529 }, { x: 542, y: 519 }, { x: 538, y: 511 }, { x: 528, y: 510 }, { x: 520, y: 510 }, { x: 503, y: 510 }, { x: 492, y: 511 }, { x: 479, y: 511 }, { x: 482, y: 497 }, { x: 486, y: 485 }, { x: 499, y: 475 }, { x: 504, y: 462 }, { x: 503, y: 446 }, { x: 493, y: 435 }, { x: 481, y: 433 }, { x: 468, y: 437 }, { x: 459, y: 450 }, { x: 445, y: 465 }, { x: 442, y: 481 }, { x: 438, y: 494 }, { x: 439, y: 506 }, { x: 445, y: 533 }], fill: '#4a9f6a', stroke: '#2d6b4d' },
  { id: 'rockford_west', name: 'Rockford West', points: [{ x: 359, y: 588 }, { x: 338, y: 601 }, { x: 314, y: 602 }, { x: 310, y: 581 }, { x: 311, y: 566 }, { x: 303, y: 559 }, { x: 306, y: 548 }, { x: 322, y: 552 }, { x: 324, y: 563 }, { x: 334, y: 567 }, { x: 347, y: 560 }, { x: 359, y: 555 }, { x: 365, y: 545 }, { x: 377, y: 531 }, { x: 384, y: 519 }, { x: 381, y: 502 }, { x: 378, y: 490 }, { x: 382, y: 471 }, { x: 395, y: 458 }, { x: 407, y: 444 }, { x: 424, y: 433 }, { x: 432, y: 433 }, { x: 441, y: 438 }, { x: 443, y: 448 }, { x: 435, y: 458 }, { x: 431, y: 471 }, { x: 428, y: 483 }, { x: 427, y: 496 }, { x: 425, y: 510 }, { x: 427, y: 523 }, { x: 402, y: 538 }, { x: 385, y: 552 }, { x: 378, y: 566 }, { x: 372, y: 581 }], fill: '#4a9f6a', stroke: '#2d6b4d' },
  { id: 'rockford_north_island', name: 'Rockford North island', points: [{ x: 357, y: 409 }, { x: 382, y: 420 }, { x: 365, y: 445 }, { x: 343, y: 446 }], fill: '#4a9f6a', stroke: '#2d6b4d' },
  { id: 'queen_island', name: 'Queen island', points: [{ x: 534, y: 436 }, { x: 538, y: 451 }, { x: 560, y: 451 }, { x: 561, y: 433 }], fill: '#4a9f6a', stroke: '#2d6b4d' },
  { id: 'cyprus', name: 'Cyprus', points: [{ x: 728, y: 725 }, { x: 649, y: 762 }, { x: 643, y: 760 }, { x: 724, y: 710 }, { x: 738, y: 698 }, { x: 741, y: 685 }, { x: 738, y: 675 }, { x: 734, y: 665 }, { x: 737, y: 653 }, { x: 745, y: 657 }, { x: 750, y: 665 }, { x: 755, y: 669 }, { x: 767, y: 664 }, { x: 773, y: 658 }, { x: 781, y: 651 }, { x: 795, y: 643 }, { x: 807, y: 636 }, { x: 816, y: 636 }, { x: 827, y: 636 }, { x: 832, y: 626 }, { x: 842, y: 625 }, { x: 841, y: 636 }, { x: 855, y: 637 }, { x: 863, y: 640 }, { x: 873, y: 648 }, { x: 876, y: 658 }, { x: 876, y: 671 }, { x: 877, y: 679 }, { x: 877, y: 694 }, { x: 877, y: 701 }, { x: 877, y: 711 }, { x: 867, y: 719 }, { x: 859, y: 710 }, { x: 841, y: 715 }, { x: 828, y: 723 }, { x: 820, y: 732 }, { x: 814, y: 740 }, { x: 796, y: 744 }], fill: '#5a8a5a', stroke: '#3d6b4d' },
  { id: 'skopelos', name: 'Skopelos', points: [{ x: 731, y: 438 }, { x: 721, y: 454 }, { x: 737, y: 452 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'izolirani_main', name: 'Izolirani main', points: [{ x: 919, y: 435 }, { x: 934, y: 446 }, { x: 953, y: 449 }, { x: 967, y: 447 }, { x: 971, y: 437 }, { x: 946, y: 400 }, { x: 945, y: 389 }, { x: 941, y: 378 }, { x: 892, y: 343 }, { x: 885, y: 354 }, { x: 877, y: 364 }, { x: 866, y: 368 }, { x: 853, y: 378 }, { x: 845, y: 387 }, { x: 852, y: 400 }, { x: 859, y: 412 }, { x: 856, y: 422 }, { x: 856, y: 433 }, { x: 864, y: 446 }, { x: 885, y: 428 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'izol_desert', name: 'IZOL desert', points: [{ x: 942, y: 352 }, { x: 921, y: 366 }, { x: 939, y: 383 }, { x: 973, y: 365 }, { x: 963, y: 349 }, { x: 960, y: 328 }, { x: 966, y: 316 }, { x: 960, y: 303 }, { x: 944, y: 308 }, { x: 935, y: 319 }, { x: 944, y: 333 }], fill: '#c9a227', stroke: '#a08020' },
  { id: 'izol_north_island', name: 'izol north island', points: [{ x: 864, y: 348 }, { x: 874, y: 338 }, { x: 874, y: 326 }, { x: 849, y: 330 }, { x: 834, y: 340 }, { x: 844, y: 362 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'perth', name: 'Perth', points: [{ x: 753, y: 233 }, { x: 782, y: 235 }, { x: 806, y: 244 }, { x: 809, y: 262 }, { x: 819, y: 272 }, { x: 827, y: 261 }, { x: 827, y: 249 }, { x: 832, y: 237 }, { x: 842, y: 228 }, { x: 852, y: 215 }, { x: 863, y: 204 }, { x: 851, y: 193 }, { x: 839, y: 193 }, { x: 812, y: 189 }, { x: 720, y: 180 }, { x: 707, y: 169 }, { x: 696, y: 161 }, { x: 691, y: 149 }, { x: 681, y: 144 }, { x: 667, y: 147 }, { x: 662, y: 157 }, { x: 668, y: 172 }, { x: 670, y: 183 }, { x: 666, y: 193 }, { x: 659, y: 204 }, { x: 695, y: 233 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'perth_north_island', name: 'Perth north island', points: [{ x: 743, y: 165 }, { x: 749, y: 124 }, { x: 759, y: 124 }, { x: 759, y: 133 }, { x: 769, y: 137 }, { x: 773, y: 146 }, { x: 766, y: 155 }, { x: 763, y: 169 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'orenji', name: 'Orenji', points: [{ x: 295, y: 108 }, { x: 303, y: 98 }, { x: 313, y: 95 }, { x: 321, y: 91 }, { x: 324, y: 81 }, { x: 331, y: 69 }, { x: 340, y: 60 }, { x: 356, y: 51 }, { x: 374, y: 42 }, { x: 391, y: 37 }, { x: 410, y: 33 }, { x: 424, y: 33 }, { x: 435, y: 34 }, { x: 447, y: 34 }, { x: 454, y: 44 }, { x: 442, y: 53 }, { x: 404, y: 55 }, { x: 370, y: 67 }, { x: 346, y: 80 }, { x: 343, y: 96 }, { x: 332, y: 106 }, { x: 324, y: 115 }, { x: 320, y: 128 }, { x: 321, y: 141 }, { x: 331, y: 149 }, { x: 334, y: 159 }, { x: 324, y: 166 }, { x: 314, y: 174 }, { x: 303, y: 172 }, { x: 295, y: 162 }, { x: 285, y: 151 }, { x: 296, y: 141 }, { x: 279, y: 134 }, { x: 277, y: 123 }, { x: 282, y: 112 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'orenji_south', name: 'Orenji south', points: [{ x: 238, y: 176 }, { x: 249, y: 196 }, { x: 257, y: 211 }, { x: 261, y: 227 }, { x: 285, y: 234 }, { x: 304, y: 236 }, { x: 329, y: 237 }, { x: 371, y: 236 }, { x: 418, y: 236 }, { x: 385, y: 243 }, { x: 356, y: 246 }, { x: 328, y: 246 }, { x: 310, y: 246 }, { x: 293, y: 246 }, { x: 278, y: 246 }, { x: 264, y: 244 }, { x: 252, y: 241 }, { x: 235, y: 232 }, { x: 229, y: 221 }, { x: 225, y: 205 }, { x: 227, y: 187 }, { x: 227, y: 176 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'grindavik', name: 'Grindavik', points: [{ x: 44, y: 303 }, { x: 54, y: 283 }, { x: 68, y: 301 }, { x: 71, y: 326 }, { x: 43, y: 326 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'south_island_gridavik', name: 'South island gridavik', points: [{ x: 67, y: 345 }, { x: 51, y: 344 }, { x: 47, y: 367 }, { x: 58, y: 376 }, { x: 60, y: 360 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'sauthemptona', name: 'Sauthemptona', points: [{ x: 46, y: 698 }, { x: 71, y: 694 }, { x: 89, y: 694 }, { x: 103, y: 693 }, { x: 107, y: 685 }, { x: 104, y: 676 }, { x: 101, y: 667 }, { x: 90, y: 664 }, { x: 74, y: 669 }, { x: 58, y: 673 }, { x: 50, y: 673 }, { x: 43, y: 680 }, { x: 33, y: 690 }, { x: 35, y: 697 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'st_barthelemy', name: 'St Barthelemy', points: [{ x: 424, y: 316 }, { x: 452, y: 354 }, { x: 460, y: 366 }, { x: 471, y: 357 }, { x: 484, y: 357 }, { x: 493, y: 353 }, { x: 504, y: 348 }, { x: 504, y: 339 }, { x: 504, y: 328 }, { x: 498, y: 294 }, { x: 485, y: 330 }, { x: 461, y: 343 }, { x: 434, y: 315 }], fill: '#c9a960', stroke: '#a08040' },
];

const DEFAULT_FIR_ZONES: FIRZone[] = [
  { id: 'itko_fir', code: 'ITKO', name: 'ITKO FIR', points: [{ x: 178, y: -1 }, { x: 616, y: 0 }, { x: 523, y: 214 }, { x: 327, y: 321 }, { x: 193, y: 325 }, { x: 168, y: 197 }, { x: 0, y: 197 }, { x: 14, y: 7 }], color: 'rgba(255,100,100,0.15)', borderColor: '#ff6464' },
  { id: 'irfd_fir', code: 'IRFD', name: 'IRFD FIR', points: [{ x: 536, y: 211 }, { x: 606, y: 292 }, { x: 648, y: 525 }, { x: 600, y: 786 }, { x: 217, y: 786 }, { x: 200, y: 599 }, { x: 192, y: 326 }, { x: 324, y: 326 }], color: 'rgba(255,150,50,0.15)', borderColor: '#ff9632' },
  { id: 'ipph_fir', code: 'IPPH', name: 'IPPH FIR', points: [{ x: 618, y: 9 }, { x: 1005, y: 10 }, { x: 920, y: 241 }, { x: 814, y: 304 }, { x: 607, y: 291 }, { x: 534, y: 198 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'izol_fir', code: 'IZOL', name: 'IZOL FIR', points: [{ x: 613, y: 298 }, { x: 819, y: 313 }, { x: 919, y: 249 }, { x: 1001, y: 239 }, { x: 1001, y: 558 }, { x: 648, y: 524 }], color: 'rgba(200,100,255,0.15)', borderColor: '#c864ff' },
  { id: 'ilar_fir', code: 'ILAR', name: 'ILAR FIR', points: [{ x: 652, y: 532 }, { x: 1002, y: 564 }, { x: 999, y: 786 }, { x: 605, y: 786 }], color: 'rgba(100,255,100,0.15)', borderColor: '#64ff64' },
  { id: 'grindavik_fir', code: 'IGRV', name: 'Grindavik FIR', points: [{ x: -1, y: 202 }, { x: 171, y: 205 }, { x: 190, y: 329 }, { x: 196, y: 568 }, { x: -1, y: 561 }], color: 'rgba(100,150,255,0.15)', borderColor: '#6496ff' },
  { id: 'sauthemptona_fir', code: 'ISAU', name: 'Sauthemptona FIR', points: [{ x: -1, y: 566 }, { x: 190, y: 573 }, { x: 211, y: 780 }, { x: 1, y: 783 }], color: 'rgba(200,100,255,0.15)', borderColor: '#c864ff' },
];

const POSITION_PRIORITY = ['Center', 'APP', 'DEP', 'Tower', 'Ground', 'Delivery', 'Clairance'] as const;

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h${String(mins % 60).padStart(2, '0')}`;
}

function FourPointStar({ cx, cy, outerR, innerR, rotation = 0, fill, stroke, strokeWidth = 1, opacity = 1 }: {
  cx: number; cy: number; outerR: number; innerR: number; rotation?: number;
  fill: string; stroke: string; strokeWidth?: number; opacity?: number;
}) {
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 + rotation) * (Math.PI / 180);
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle - Math.PI / 2)},${cy + r * Math.sin(angle - Math.PI / 2)}`);
  }
  return <polygon points={points.join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
}

export default function AtcMapClient() {
  const [sessions, setSessions] = useState<AtcSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/atc/online');
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions();
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const sessionsByAirport = new Map<string, AtcSession[]>();
  sessions.forEach(s => {
    const list = sessionsByAirport.get(s.aeroport) || [];
    list.push(s);
    sessionsByAirport.set(s.aeroport, list);
  });

  const centerAirports = new Set(
    sessions.filter(s => s.position === 'Center').map(s => s.aeroport)
  );

  const airportsWithATC = Array.from(sessionsByAirport.entries())
    .map(([code, sess]) => ({
      code,
      name: AIRPORT_NAMES[code] || code,
      sessions: sess.sort((a, b) =>
        POSITION_PRIORITY.indexOf(a.position as typeof POSITION_PRIORITY[number]) -
        POSITION_PRIORITY.indexOf(b.position as typeof POSITION_PRIORITY[number])
      ),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length);

  const hasPosition = (code: string, pos: string) =>
    sessionsByAirport.get(code)?.some(s => s.position === pos) || false;

  void now;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-slate-100">Carte ATC en direct</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-600/30">
              {sessions.length} contrôleur{sessions.length > 1 ? 's' : ''} en ligne
            </span>
          </div>
          <button onClick={() => { setLoading(true); fetchSessions(); }} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700" title="Actualiser">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-4 flex gap-4" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Carte */}
        <div className="flex-1 relative rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden"
          ref={mapContainerRef}
        >
          <div style={{ width: '100%', height: '100%' }}>
            <svg viewBox="0 0 1024 787" className="w-full h-full" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1a2744 50%, #0f172a 100%)' }}>
              {/* Grille radar */}
              <defs>
                <pattern id="radarGrid" x="0" y="0" width="64" height="49.19" patternUnits="userSpaceOnUse">
                  <path d="M 64 0 L 0 0 0 49.19" fill="none" stroke="rgba(100,150,200,0.06)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="1024" height="787" fill="url(#radarGrid)" />

              {/* FIR zones - seulement si CTR en ligne */}
              {DEFAULT_FIR_ZONES.map(fir => {
                if (!centerAirports.has(fir.code)) return null;
                return (
                  <g key={fir.id}>
                    <polygon
                      points={fir.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill={fir.color}
                      stroke={fir.borderColor}
                      strokeWidth="2"
                      strokeDasharray="8 4"
                      opacity="0.9"
                    />
                    <text
                      x={fir.points.reduce((s, p) => s + p.x, 0) / fir.points.length}
                      y={fir.points.reduce((s, p) => s + p.y, 0) / fir.points.length}
                      fill={fir.borderColor}
                      fontSize="14"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      opacity="0.7"
                    >
                      {fir.name}
                    </text>
                  </g>
                );
              })}

              {/* Iles */}
              {DEFAULT_ISLANDS.map(island => (
                <polygon
                  key={island.id}
                  points={island.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={island.fill}
                  stroke={island.stroke}
                  strokeWidth="1.5"
                  opacity="0.7"
                />
              ))}

              {/* Overlays ATC pour chaque aéroport */}
              {Object.entries(DEFAULT_POSITIONS).map(([code, pos]) => {
                const x = pos.x * 10.24;
                const y = pos.y * 7.87;
                const hasATC = sessionsByAirport.has(code);
                const hasApp = hasPosition(code, 'APP');
                const hasDep = hasPosition(code, 'DEP');
                const hasTwr = hasPosition(code, 'Tower');
                const hasGnd = hasPosition(code, 'Ground');
                const hasDel = hasPosition(code, 'Delivery') || hasPosition(code, 'Clairance');

                return (
                  <g key={code} onClick={() => setSelectedAirport(selectedAirport === code ? null : code)} style={{ cursor: 'pointer' }}>
                    {/* APP - cercle bleu */}
                    {hasApp && (
                      <circle cx={x} cy={y} r="55" fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 4" opacity="0.9">
                        <animate attributeName="r" values="52;58;52" dur="4s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* DEP - cercle blanc */}
                    {hasDep && (
                      <circle cx={x} cy={y} r="45" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.8">
                        <animate attributeName="r" values="42;48;42" dur="5s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* TWR - carré rouge */}
                    {hasTwr && (
                      <rect x={x - 16} y={y - 16} width="32" height="32" fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth="2" rx="3" opacity="0.9" />
                    )}

                    {/* GND - étoile 4 branches cardinal (0°) */}
                    {hasGnd && (
                      <FourPointStar cx={x} cy={y} outerR={14} innerR={5} rotation={0} fill="rgba(245,158,11,0.8)" stroke="#f59e0b" strokeWidth={1.2} />
                    )}

                    {/* DEL/Clairance - étoile 4 branches 45° */}
                    {hasDel && (
                      <FourPointStar cx={x} cy={y} outerR={12} innerR={4} rotation={45} fill="rgba(16,185,129,0.8)" stroke="#10b981" strokeWidth={1.2} />
                    )}

                    {/* Point central aéroport */}
                    <circle cx={x} cy={y} r={hasATC ? 4 : 4} fill={hasATC ? '#10b981' : '#64748b'} stroke="white" strokeWidth={hasATC ? 1.5 : 1} opacity={hasATC ? 1 : 0.5} />

                    {/* Indicateur pulsant si ATC en ligne */}
                    {hasATC && (
                      <circle cx={x} cy={y} r="6" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.6">
                        <animate attributeName="r" values="6;18;6" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Label aéroport */}
                    <text x={x} y={y + (hasATC ? 22 : 16)} fill={hasATC ? '#4ade80' : '#94a3b8'} fontSize={hasATC ? '9' : '7'} fontFamily="monospace" fontWeight={hasATC ? 'bold' : 'normal'} textAnchor="middle" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Légende overlay */}
          <div className="absolute bottom-3 left-3 rounded-lg bg-slate-900/90 border border-slate-700/50 p-3 text-xs space-y-1.5 backdrop-blur-sm">
            <p className="text-slate-400 font-semibold mb-2">Légende</p>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500/10" />  <span className="text-slate-300">APP (Approche)</span></div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border border-white/60 bg-white/5" /> <span className="text-slate-300">DEP (Départ)</span></div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm border-2 border-red-500 bg-red-500/15" /> <span className="text-slate-300">TWR (Tour)</span></div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4">
                <FourPointStar cx={8} cy={8} outerR={7} innerR={2.5} rotation={0} fill="rgba(245,158,11,0.8)" stroke="#f59e0b" strokeWidth={0.8} />
              </svg>
              <span className="text-slate-300">GND (Sol)</span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4">
                <FourPointStar cx={8} cy={8} outerR={7} innerR={2.5} rotation={45} fill="rgba(16,185,129,0.8)" stroke="#10b981" strokeWidth={0.8} />
              </svg>
              <span className="text-slate-300">DEL (Clairance)</span>
            </div>
            <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-orange-500" style={{ borderColor: '#ff9632' }} /> <span className="text-slate-300">FIR (Center en ligne)</span></div>
          </div>
        </div>

        {/* Panneau latéral */}
        <div className="w-80 flex-shrink-0 rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-700/30">
            <h2 className="font-semibold text-slate-100 text-sm">Contrôleurs en ligne</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && <p className="text-slate-500 text-sm text-center py-8">Chargement...</p>}
            {!loading && airportsWithATC.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <Radio className="h-8 w-8 text-slate-600 mx-auto" />
                <p className="text-slate-500 text-sm">Aucun contrôleur en ligne</p>
              </div>
            )}
            {airportsWithATC.map(ap => (
              <button
                key={ap.code}
                onClick={() => setSelectedAirport(selectedAirport === ap.code ? null : ap.code)}
                className={`w-full text-left rounded-lg p-3 transition border ${
                  selectedAirport === ap.code
                    ? 'bg-emerald-900/20 border-emerald-600/30'
                    : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-emerald-400 text-sm">{ap.code}</span>
                  <span className="text-slate-500 text-xs">{ap.name}</span>
                </div>
                <div className="space-y-1">
                  {ap.sessions.map(s => (
                    <div key={`${s.aeroport}-${s.position}`} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          s.position === 'Center' ? 'bg-orange-400' :
                          s.position === 'APP' ? 'bg-blue-400' :
                          s.position === 'DEP' ? 'bg-white' :
                          s.position === 'Tower' ? 'bg-red-400' :
                          s.position === 'Ground' ? 'bg-amber-400' :
                          'bg-emerald-400'
                        }`} />
                        <span className="text-slate-300">{s.position}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.callsign && <span className="text-slate-500">{s.callsign}</span>}
                        <span className="text-slate-600">{formatDuration(s.started_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
