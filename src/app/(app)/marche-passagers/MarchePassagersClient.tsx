'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Users, Plane, TrendingUp, MapPin, RefreshCw, Radio, ZoomIn, ZoomOut, Move, Settings, Copy, Check, X, Eye, EyeOff, Plus, Trash2, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AeroportData {
  code: string;
  nom: string;
  taille: 'international' | 'regional' | 'small' | 'military';
  tourisme: boolean;
  passagersMax: number;
  passagers_disponibles: number;
  passagers_max: number;
  derniere_regeneration: string | null;
  vor?: string;
  freq?: string;
}

interface Props {
  aeroports: AeroportData[];
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

// Positions des aéroports (en pourcentage)
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  'IDCS': { x: 55, y: 3 },
  'ITKO': { x: 40, y: 12 },
  'IPPH': { x: 70, y: 17 },
  'ILKL': { x: 76, y: 21 },
  'IGRV': { x: 14, y: 40 },
  'ISAU': { x: 12, y: 66 },
  'IBTH': { x: 56, y: 38 },
  'IMLR': { x: 36, y: 53 },
  'IBLT': { x: 38, y: 56 },
  'IRFD': { x: 44, y: 63 },
  'IGAR': { x: 36, y: 65 },
  'ITRC': { x: 52, y: 76 },
  'ISCM': { x: 83, y: 38 },
  'IZOL': { x: 88, y: 46 },
  'IJAF': { x: 92, y: 44 },
  'ISKP': { x: 74, y: 54 },
  'ILAR': { x: 74, y: 80 },
  'IPAP': { x: 84, y: 85 },
  'IBAR': { x: 80, y: 88 },
  'IHEN': { x: 70, y: 90 },
  'IIAB': { x: 76, y: 92 },
  'IBRD': { x: 68, y: 24 },
  'IUFO': { x: 17, y: 46 },
};

// Îles initiales (en coordonnées SVG 1024x787)
const DEFAULT_ISLANDS: Island[] = [
  { id: 'orenji', name: 'Orenji', points: [{ x: 360, y: 50 }, { x: 420, y: 55 }, { x: 520, y: 100 }, { x: 530, y: 140 }, { x: 470, y: 145 }, { x: 380, y: 115 }, { x: 345, y: 70 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'perth', name: 'Perth', points: [{ x: 680, y: 120 }, { x: 780, y: 125 }, { x: 860, y: 175 }, { x: 860, y: 250 }, { x: 780, y: 285 }, { x: 680, y: 250 }, { x: 660, y: 170 }], fill: '#3d6b4d', stroke: '#1a3d2a' },
  { id: 'bird', name: 'Bird Island', points: [{ x: 650, y: 180 }, { x: 690, y: 185 }, { x: 690, y: 215 }, { x: 655, y: 210 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'grindavik', name: 'Grindavik', points: [{ x: 100, y: 300 }, { x: 170, y: 310 }, { x: 180, y: 380 }, { x: 120, y: 415 }, { x: 70, y: 360 }], fill: '#3d6b4d', stroke: '#1a3d2a' },
  { id: 'barthelemy', name: 'Saint Barthelemy', points: [{ x: 520, y: 280 }, { x: 600, y: 285 }, { x: 620, y: 350 }, { x: 550, y: 375 }, { x: 505, y: 320 }], fill: '#3d6b4d', stroke: '#1a3d2a' },
  { id: 'izolirani', name: 'Izolirani', points: [{ x: 820, y: 280 }, { x: 930, y: 300 }, { x: 960, y: 400 }, { x: 870, y: 470 }, { x: 780, y: 410 }, { x: 790, y: 300 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'izol_desert', name: 'Izolirani Desert', points: [{ x: 860, y: 310 }, { x: 930, y: 360 }, { x: 880, y: 420 }, { x: 850, y: 350 }], fill: '#c9a227', stroke: '#a08020' },
  { id: 'sauthemptona', name: 'Sauthemptona', points: [{ x: 80, y: 500 }, { x: 160, y: 520 }, { x: 155, y: 600 }, { x: 80, y: 620 }, { x: 55, y: 550 }], fill: '#3d6b4d', stroke: '#1a3d2a' },
  { id: 'rockford_n', name: 'Rockford North', points: [{ x: 340, y: 380 }, { x: 460, y: 390 }, { x: 490, y: 470 }, { x: 400, y: 505 }, { x: 320, y: 450 }], fill: '#3d6b4d', stroke: '#1a3d2a' },
  { id: 'rockford_main', name: 'Rockford Main', points: [{ x: 300, y: 480 }, { x: 460, y: 485 }, { x: 540, y: 590 }, { x: 460, y: 700 }, { x: 300, y: 690 }, { x: 260, y: 570 }], fill: '#2d5a3d', stroke: '#1a3d2a' },
  { id: 'queen', name: 'Queen Islet', points: [{ x: 510, y: 420 }, { x: 560, y: 435 }, { x: 555, y: 480 }, { x: 505, y: 470 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'skopelos', name: 'Skopelos', points: [{ x: 700, y: 420 }, { x: 790, y: 435 }, { x: 800, y: 510 }, { x: 710, y: 530 }, { x: 680, y: 455 }], fill: '#4a9f6a', stroke: '#2d6b4d' },
  { id: 'cyprus', name: 'Cyprus', points: [{ x: 650, y: 620 }, { x: 850, y: 630 }, { x: 910, y: 760 }, { x: 770, y: 850 }, { x: 620, y: 790 }, { x: 610, y: 660 }], fill: '#c9a960', stroke: '#a08040' },
  { id: 'cyprus_green', name: 'Cyprus Green', points: [{ x: 700, y: 660 }, { x: 800, y: 690 }, { x: 790, y: 780 }, { x: 690, y: 780 }, { x: 680, y: 690 }], fill: '#5a8a5a', stroke: '#3d6b4d' },
];

// Zones FIR initiales (en coordonnées SVG)
const DEFAULT_FIR_ZONES: FIRZone[] = [
  { id: 'grindavik_fir', code: 'GRINDAVIK', name: 'Grindavik FIR', points: [{ x: 0, y: 250 }, { x: 280, y: 250 }, { x: 280, y: 787 }, { x: 0, y: 787 }], color: 'rgba(255,200,0,0.1)', borderColor: '#ffc800' },
  { id: 'barthelemy_fir', code: 'BARTHELEMY', name: 'Barthelemy FIR', points: [{ x: 280, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 400 }, { x: 280, y: 400 }], color: 'rgba(0,200,255,0.1)', borderColor: '#00c8ff' },
  { id: 'rockford_fir', code: 'ROCKFORD', name: 'Rockford FIR', points: [{ x: 280, y: 400 }, { x: 650, y: 400 }, { x: 650, y: 787 }, { x: 280, y: 787 }], color: 'rgba(255,100,100,0.1)', borderColor: '#ff6464' },
  { id: 'perth_fir', code: 'PERTH', name: 'Perth FIR', points: [{ x: 600, y: 0 }, { x: 1024, y: 0 }, { x: 1024, y: 300 }, { x: 600, y: 300 }], color: 'rgba(200,100,255,0.1)', borderColor: '#c864ff' },
  { id: 'izolirani_fir', code: 'IZOLIRANI', name: 'Izolirani FIR', points: [{ x: 700, y: 300 }, { x: 1024, y: 300 }, { x: 1024, y: 550 }, { x: 700, y: 550 }], color: 'rgba(255,150,50,0.1)', borderColor: '#ff9632' },
  { id: 'larnaca_fir', code: 'LARNACA', name: 'Larnaca FIR', points: [{ x: 600, y: 550 }, { x: 1024, y: 550 }, { x: 1024, y: 787 }, { x: 600, y: 787 }], color: 'rgba(100,255,100,0.1)', borderColor: '#64ff64' },
];

// Waypoints
const WAYPOINTS = [
  { code: 'SHELL', x: 30, y: 8 }, { code: 'SHIBA', x: 35, y: 10 }, { code: 'NIKON', x: 55, y: 4 },
  { code: 'ASTRO', x: 32, y: 14 }, { code: 'LETSE', x: 48, y: 10 }, { code: 'HONDA', x: 52, y: 13 },
  { code: 'CHILY', x: 60, y: 8 }, { code: 'CRAZY', x: 72, y: 10 }, { code: 'WOTAN', x: 92, y: 8 },
  { code: 'WELLS', x: 78, y: 15 }, { code: 'GULEG', x: 28, y: 18 }, { code: 'PIPER', x: 42, y: 16 },
  { code: 'ONDER', x: 50, y: 16 }, { code: 'KNIFE', x: 62, y: 15 }, { code: 'TINDR', x: 68, y: 18 },
  { code: 'TUDEP', x: 45, y: 22 }, { code: 'ALLRY', x: 55, y: 22 }, { code: 'BOBOS', x: 18, y: 25 },
  { code: 'BLANK', x: 30, y: 28 }, { code: 'THENR', x: 25, y: 32 }, { code: 'YOUTH', x: 28, y: 38 },
  { code: 'ACRES', x: 15, y: 36 }, { code: 'PROBE', x: 48, y: 35 }, { code: 'DINER', x: 55, y: 38 },
  { code: 'EZYDB', x: 28, y: 42 }, { code: 'RESURGE', x: 52, y: 40 }, { code: 'WELSH', x: 46, y: 44 },
  { code: 'CAMEL', x: 74, y: 42 }, { code: 'DUNKS', x: 80, y: 45 }, { code: 'ROSMO', x: 88, y: 35 },
  { code: 'FRANK', x: 10, y: 50 }, { code: 'ENDER', x: 32, y: 50 }, { code: 'KENED', x: 40, y: 52 },
  { code: 'INDEX', x: 48, y: 50 }, { code: 'GAVIN', x: 58, y: 52 }, { code: 'SILVA', x: 64, y: 54 },
  { code: 'CELAR', x: 20, y: 54 }, { code: 'SUNST', x: 30, y: 54 }, { code: 'BUCFA', x: 36, y: 56 },
  { code: 'KUNAV', x: 46, y: 56 }, { code: 'SETHR', x: 56, y: 56 }, { code: 'OCEEN', x: 62, y: 52 },
  { code: 'THACC', x: 8, y: 58 }, { code: 'SHREK', x: 16, y: 56 }, { code: 'SPACE', x: 24, y: 58 },
  { code: 'SAWPE', x: 32, y: 60 }, { code: 'HAWFA', x: 45, y: 60 }, { code: 'ICTAM', x: 38, y: 54 },
  { code: 'HACKE', x: 12, y: 66 }, { code: 'BEANS', x: 30, y: 66 }, { code: 'LOGAN', x: 40, y: 68 },
  { code: 'ATPEV', x: 56, y: 64 }, { code: 'LAVNO', x: 52, y: 66 }, { code: 'ANYMS', x: 62, y: 70 },
  { code: 'GEORG', x: 25, y: 70 }, { code: 'SEEKS', x: 22, y: 74 }, { code: 'EXMOR', x: 40, y: 74 },
  { code: 'JAMSI', x: 56, y: 74 }, { code: 'GRASS', x: 66, y: 76 }, { code: 'PEPUL', x: 46, y: 78 },
  { code: 'GODLU', x: 52, y: 78 }, { code: 'LAZER', x: 58, y: 80 }, { code: 'ALDER', x: 30, y: 84 },
  { code: 'STACK', x: 34, y: 86 }, { code: 'EMJAY', x: 42, y: 88 }, { code: 'ODOKU', x: 50, y: 86 },
  { code: 'CANDLE', x: 60, y: 86 }, { code: 'AQWRT', x: 66, y: 88 }, { code: 'FORIA', x: 72, y: 90 },
  { code: 'TRELN', x: 40, y: 94 }, { code: 'REAPR', x: 48, y: 94 }, { code: 'DIRECTOR', x: 70, y: 95 },
];

// VOR/DME
const VORS = [
  { code: 'HME', freq: '112.20', x: 40, y: 12, name: 'Haneda' },
  { code: 'PER', freq: '115.43', x: 72, y: 18, name: 'Perth' },
  { code: 'GVK', freq: '112.32', x: 14, y: 40, name: 'Grindavik' },
  { code: 'SAU', freq: '115.35', x: 12, y: 66, name: 'Sauthemptona' },
  { code: 'MLR', freq: '114.75', x: 36, y: 53, name: 'Mellor' },
  { code: 'RFD', freq: '113.55', x: 44, y: 64, name: 'Rockford' },
  { code: 'BLA', freq: '117.45', x: 50, y: 56, name: 'Blades' },
  { code: 'TRN', freq: '113.10', x: 52, y: 76, name: 'Training' },
  { code: 'GRY', freq: '111.90', x: 36, y: 65, name: 'Garry' },
  { code: 'LCK', freq: '112.90', x: 74, y: 80, name: 'Larnaca' },
  { code: 'PFO', freq: '117.95', x: 84, y: 85, name: 'Paphos' },
  { code: 'NJF', freq: '112.45', x: 92, y: 44, name: 'Najaf' },
  { code: 'IZO', freq: '117.53', x: 88, y: 46, name: 'Izolirani' },
];

const ISLAND_COLORS = [
  { fill: '#2d5a3d', stroke: '#1a3d2a', name: 'Vert foncé' },
  { fill: '#3d6b4d', stroke: '#1a3d2a', name: 'Vert' },
  { fill: '#4a7a5a', stroke: '#1a3d2a', name: 'Vert clair' },
  { fill: '#4a9f6a', stroke: '#2d6b4d', name: 'Vert vif' },
  { fill: '#5a8a5a', stroke: '#3d6b4d', name: 'Vert prairie' },
  { fill: '#c9a960', stroke: '#a08040', name: 'Sable' },
  { fill: '#c9a227', stroke: '#a08020', name: 'Désert' },
  { fill: '#8b7355', stroke: '#6b5344', name: 'Terre' },
];

const FIR_COLORS = [
  { color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800', name: 'Jaune' },
  { color: 'rgba(0,200,255,0.15)', borderColor: '#00c8ff', name: 'Cyan' },
  { color: 'rgba(255,100,100,0.15)', borderColor: '#ff6464', name: 'Rouge' },
  { color: 'rgba(200,100,255,0.15)', borderColor: '#c864ff', name: 'Violet' },
  { color: 'rgba(255,150,50,0.15)', borderColor: '#ff9632', name: 'Orange' },
  { color: 'rgba(100,255,100,0.15)', borderColor: '#64ff64', name: 'Vert' },
  { color: 'rgba(100,150,255,0.15)', borderColor: '#6496ff', name: 'Bleu' },
];

const TAILLE_COLORS: Record<string, string> = {
  international: 'bg-purple-500 border-purple-400',
  regional: 'bg-sky-500 border-sky-400',
  small: 'bg-emerald-500 border-emerald-400',
  military: 'bg-red-500 border-red-400',
};

const TAILLE_SVG_COLORS: Record<string, string> = {
  international: '#a855f7',
  regional: '#0ea5e9',
  small: '#10b981',
  military: '#ef4444',
};

const TAILLE_LABELS: Record<string, string> = {
  international: 'International',
  regional: 'Régional',
  small: 'Petit',
  military: 'Militaire',
};

type AdminEditMode = 'airports' | 'islands' | 'fir';

export default function MarchePassagersClient({ aeroports }: Props) {
  const router = useRouter();
  const [selectedAeroport, setSelectedAeroport] = useState<AeroportData | null>(null);
  const [viewMode, setViewMode] = useState<'carte' | 'liste'>('carte');
  const [refreshing, setRefreshing] = useState(false);
  
  // Couches visibles
  const [showFIR, setShowFIR] = useState(true);
  const [showWaypoints, setShowWaypoints] = useState(false);
  const [showVOR, setShowVOR] = useState(true);
  const [showIslands, setShowIslands] = useState(true);
  
  // Zoom et pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Mode admin
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminEditMode, setAdminEditMode] = useState<AdminEditMode>('airports');
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(DEFAULT_POSITIONS);
  const [islands, setIslands] = useState<Island[]>(DEFAULT_ISLANDS);
  const [firZones, setFirZones] = useState<FIRZone[]>(DEFAULT_FIR_ZONES);
  const [draggingAeroport, setDraggingAeroport] = useState<string | null>(null);
  const [draggingPoint, setDraggingPoint] = useState<{ type: 'island' | 'fir'; id: string; pointIndex: number } | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<string | null>(null);
  const [selectedFir, setSelectedFir] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [showNewItemModal, setShowNewItemModal] = useState(false);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.max(z - 0.25, 0.5);
      if (newZoom <= 1) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (isAdminMode) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        setZoom(z => Math.min(z + 0.25, 4));
      } else {
        setZoom(z => {
          const newZoom = Math.max(z - 0.25, 0.5);
          if (newZoom <= 1) setPan({ x: 0, y: 0 });
          return newZoom;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isAdminMode]);

  const getSvgCoordinates = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1024;
    const y = ((e.clientY - rect.top) / rect.height) * 787;
    return { x: Math.round(x), y: Math.round(y) };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isAdminMode) return;
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [zoom, pan, isAdminMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Déplacement d'un point d'île ou FIR
    if (isAdminMode && draggingPoint && svgRef.current) {
      const coords = getSvgCoordinates(e);
      if (draggingPoint.type === 'island') {
        setIslands(prev => prev.map(island => {
          if (island.id === draggingPoint.id) {
            const newPoints = [...island.points];
            newPoints[draggingPoint.pointIndex] = coords;
            return { ...island, points: newPoints };
          }
          return island;
        }));
      } else {
        setFirZones(prev => prev.map(fir => {
          if (fir.id === draggingPoint.id) {
            const newPoints = [...fir.points];
            newPoints[draggingPoint.pointIndex] = coords;
            return { ...fir, points: newPoints };
          }
          return fir;
        }));
      }
      return;
    }

    // Déplacement d'un aéroport
    if (isAdminMode && draggingAeroport && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPositions(prev => ({
        ...prev,
        [draggingAeroport]: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
      }));
      return;
    }

    if (isDragging && zoom > 1) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      const maxPan = (zoom - 1) * 250;
      setPan({
        x: Math.max(-maxPan, Math.min(maxPan, newX)),
        y: Math.max(-maxPan, Math.min(maxPan, newY))
      });
    }
  }, [isDragging, zoom, dragStart, isAdminMode, draggingAeroport, draggingPoint, getSvgCoordinates]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggingAeroport(null);
    setDraggingPoint(null);
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (!isAdminMode) return;
    
    // Ajouter un point à l'île ou FIR sélectionnée
    if (adminEditMode === 'islands' && selectedIsland) {
      const coords = getSvgCoordinates(e);
      setIslands(prev => prev.map(island => {
        if (island.id === selectedIsland) {
          return { ...island, points: [...island.points, coords] };
        }
        return island;
      }));
    } else if (adminEditMode === 'fir' && selectedFir) {
      const coords = getSvgCoordinates(e);
      setFirZones(prev => prev.map(fir => {
        if (fir.id === selectedFir) {
          return { ...fir, points: [...fir.points, coords] };
        }
        return fir;
      }));
    }
  }, [isAdminMode, adminEditMode, selectedIsland, selectedFir, getSvgCoordinates]);

  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleAdminLogin = async () => {
    if (!adminPassword.trim()) {
      setAdminError('Saisissez le mot de passe superadmin.');
      return;
    }
    
    setAdminLoading(true);
    setAdminError(null);
    
    try {
      const res = await fetch('/api/verify-superadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setAdminError(data.error || 'Mot de passe incorrect');
        return;
      }
      
      setIsAdminMode(true);
      setShowAdminModal(false);
      setAdminPassword('');
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } catch {
      setAdminError('Erreur de connexion');
    } finally {
      setAdminLoading(false);
    }
  };

  const generateCode = useCallback(() => {
    if (adminEditMode === 'airports') {
      const lines = Object.entries(positions)
        .map(([code, pos]) => `  '${code}': { x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(1)} },`)
        .join('\n');
      return `const DEFAULT_POSITIONS = {\n${lines}\n};`;
    } else if (adminEditMode === 'islands') {
      const lines = islands.map(island => {
        const pointsStr = island.points.map(p => `{ x: ${p.x}, y: ${p.y} }`).join(', ');
        return `  { id: '${island.id}', name: '${island.name}', points: [${pointsStr}], fill: '${island.fill}', stroke: '${island.stroke}' },`;
      }).join('\n');
      return `const DEFAULT_ISLANDS = [\n${lines}\n];`;
    } else {
      const lines = firZones.map(fir => {
        const pointsStr = fir.points.map(p => `{ x: ${p.x}, y: ${p.y} }`).join(', ');
        return `  { id: '${fir.id}', code: '${fir.code}', name: '${fir.name}', points: [${pointsStr}], color: '${fir.color}', borderColor: '${fir.borderColor}' },`;
      }).join('\n');
      return `const DEFAULT_FIR_ZONES = [\n${lines}\n];`;
    }
  }, [adminEditMode, positions, islands, firZones]);

  const copyCode = () => {
    navigator.clipboard.writeText(generateCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addNewIsland = () => {
    if (!newItemName.trim()) return;
    const id = newItemName.toLowerCase().replace(/\s+/g, '_');
    setIslands(prev => [...prev, {
      id,
      name: newItemName,
      points: [{ x: 500, y: 400 }, { x: 550, y: 400 }, { x: 550, y: 450 }, { x: 500, y: 450 }],
      fill: ISLAND_COLORS[0].fill,
      stroke: ISLAND_COLORS[0].stroke
    }]);
    setSelectedIsland(id);
    setNewItemName('');
    setShowNewItemModal(false);
  };

  const addNewFir = () => {
    if (!newItemName.trim()) return;
    const id = newItemName.toLowerCase().replace(/\s+/g, '_') + '_fir';
    const code = newItemName.toUpperCase().replace(/\s+/g, '_');
    setFirZones(prev => [...prev, {
      id,
      code,
      name: `${newItemName} FIR`,
      points: [{ x: 400, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 500 }, { x: 400, y: 500 }],
      color: FIR_COLORS[0].color,
      borderColor: FIR_COLORS[0].borderColor
    }]);
    setSelectedFir(id);
    setNewItemName('');
    setShowNewItemModal(false);
  };

  const deletePoint = (type: 'island' | 'fir', id: string, pointIndex: number) => {
    if (type === 'island') {
      setIslands(prev => prev.map(island => {
        if (island.id === id && island.points.length > 3) {
          const newPoints = island.points.filter((_, i) => i !== pointIndex);
          return { ...island, points: newPoints };
        }
        return island;
      }));
    } else {
      setFirZones(prev => prev.map(fir => {
        if (fir.id === id && fir.points.length > 3) {
          const newPoints = fir.points.filter((_, i) => i !== pointIndex);
          return { ...fir, points: newPoints };
        }
        return fir;
      }));
    }
  };

  const deleteItem = (type: 'island' | 'fir', id: string) => {
    if (type === 'island') {
      setIslands(prev => prev.filter(i => i.id !== id));
      setSelectedIsland(null);
    } else {
      setFirZones(prev => prev.filter(f => f.id !== id));
      setSelectedFir(null);
    }
  };

  const updateIslandColor = (id: string, fill: string, stroke: string) => {
    setIslands(prev => prev.map(island => 
      island.id === id ? { ...island, fill, stroke } : island
    ));
  };

  const updateFirColor = (id: string, color: string, borderColor: string) => {
    setFirZones(prev => prev.map(fir => 
      fir.id === id ? { ...fir, color, borderColor } : fir
    ));
  };

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }

  function getPassagerRatio(aeroport: AeroportData): number {
    return aeroport.passagers_disponibles / aeroport.passagers_max;
  }

  function getPassagerColor(ratio: number): string {
    if (ratio >= 0.7) return 'text-emerald-400';
    if (ratio >= 0.4) return 'text-amber-400';
    return 'text-red-400';
  }

  function getPassagerBgColor(ratio: number): string {
    if (ratio >= 0.7) return 'bg-emerald-500/20';
    if (ratio >= 0.4) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  }

  const aeroportsTries = [...aeroports].sort((a, b) => b.passagers_disponibles - a.passagers_disponibles);
  
  const currentSelectedIsland = islands.find(i => i.id === selectedIsland);
  const currentSelectedFir = firZones.find(f => f.id === selectedFir);

  return (
    <div className="space-y-4">
      {/* Modal Admin */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-100">Mode Éditeur</h3>
              <button onClick={() => { setShowAdminModal(false); setAdminError(null); }} className="text-slate-400 hover:text-slate-200" disabled={adminLoading}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Entrez le mot de passe superadmin pour éditer la carte.
            </p>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => { setAdminPassword(e.target.value); setAdminError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && !adminLoading && handleAdminLogin()}
              placeholder="Mot de passe superadmin..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 mb-2"
              autoFocus
              disabled={adminLoading}
            />
            {adminError && <p className="text-red-400 text-sm mb-2">{adminError}</p>}
            <button
              onClick={handleAdminLogin}
              disabled={adminLoading}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 mt-2"
            >
              {adminLoading ? 'Vérification...' : 'Activer le mode éditeur'}
            </button>
          </div>
        </div>
      )}

      {/* Modal Nouvel élément */}
      {showNewItemModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 border border-slate-700">
            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {adminEditMode === 'islands' ? 'Nouvelle île' : 'Nouvelle zone FIR'}
            </h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (adminEditMode === 'islands' ? addNewIsland() : addNewFir())}
              placeholder="Nom..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNewItemModal(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
                Annuler
              </button>
              <button
                onClick={adminEditMode === 'islands' ? addNewIsland : addNewFir}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contrôles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('carte')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'carte' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <MapPin className="h-4 w-4 inline mr-2" />
            Carte
          </button>
          <button
            onClick={() => setViewMode('liste')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'liste' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Users className="h-4 w-4 inline mr-2" />
            Liste
          </button>
        </div>
        
        {/* Boutons couches */}
        {viewMode === 'carte' && !isAdminMode && (
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setShowIslands(!showIslands)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                showIslands ? 'bg-green-600/30 text-green-300 border border-green-500/50' : 'bg-slate-700 text-slate-500'
              }`}
            >
              {showIslands ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              Îles
            </button>
            <button onClick={() => setShowFIR(!showFIR)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                showFIR ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50' : 'bg-slate-700 text-slate-500'
              }`}
            >
              {showFIR ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              FIR
            </button>
            <button onClick={() => setShowVOR(!showVOR)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                showVOR ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-700 text-slate-500'
              }`}
            >
              {showVOR ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              VOR
            </button>
            <button onClick={() => setShowWaypoints(!showWaypoints)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                showWaypoints ? 'bg-lime-600/30 text-lime-300 border border-lime-500/50' : 'bg-slate-700 text-slate-500'
              }`}
            >
              {showWaypoints ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              Waypoints
            </button>
          </div>
        )}
        
        <div className="flex gap-2">
          {!isAdminMode ? (
            <button onClick={() => setShowAdminModal(true)} className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg transition-colors" title="Mode éditeur">
              <Settings className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={() => { setIsAdminMode(false); setSelectedIsland(null); setSelectedFir(null); }}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Quitter Éditeur
            </button>
          )}
          
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Bandeau Admin avec onglets */}
      {isAdminMode && (
        <div className="bg-purple-900/50 border border-purple-500/50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-2">
              <button onClick={() => { setAdminEditMode('airports'); setSelectedIsland(null); setSelectedFir(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  adminEditMode === 'airports' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Plane className="h-4 w-4 inline mr-1" />
                Aéroports
              </button>
              <button onClick={() => { setAdminEditMode('islands'); setSelectedFir(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  adminEditMode === 'islands' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <MapPin className="h-4 w-4 inline mr-1" />
                Îles
              </button>
              <button onClick={() => { setAdminEditMode('fir'); setSelectedIsland(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  adminEditMode === 'fir' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Pencil className="h-4 w-4 inline mr-1" />
                FIR
              </button>
            </div>
            <button onClick={copyCode}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copié !' : 'Copier le code'}
            </button>
          </div>
          
          {adminEditMode === 'airports' && (
            <p className="text-purple-400/70 text-sm">
              Glissez les points colorés pour repositionner les aéroports.
            </p>
          )}
          
          {adminEditMode === 'islands' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-green-400 text-sm font-medium">Île :</span>
                <select value={selectedIsland || ''} onChange={(e) => setSelectedIsland(e.target.value || null)}
                  className="px-3 py-1 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm"
                >
                  <option value="">-- Sélectionner --</option>
                  {islands.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <button onClick={() => setShowNewItemModal(true)}
                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Nouvelle
                </button>
                {selectedIsland && (
                  <button onClick={() => deleteItem('island', selectedIsland)}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" /> Supprimer
                  </button>
                )}
              </div>
              {currentSelectedIsland && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400 text-sm">Couleur :</span>
                  {ISLAND_COLORS.map((c, i) => (
                    <button key={i} onClick={() => updateIslandColor(currentSelectedIsland.id, c.fill, c.stroke)}
                      className={`w-6 h-6 rounded border-2 ${currentSelectedIsland.fill === c.fill ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c.fill }}
                      title={c.name}
                    />
                  ))}
                </div>
              )}
              <p className="text-green-400/70 text-sm">
                {selectedIsland ? 'Cliquez sur la carte pour ajouter des points. Glissez les points pour les déplacer. Clic droit pour supprimer un point.' : 'Sélectionnez ou créez une île pour la modifier.'}
              </p>
            </div>
          )}
          
          {adminEditMode === 'fir' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-amber-400 text-sm font-medium">FIR :</span>
                <select value={selectedFir || ''} onChange={(e) => setSelectedFir(e.target.value || null)}
                  className="px-3 py-1 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm"
                >
                  <option value="">-- Sélectionner --</option>
                  {firZones.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button onClick={() => setShowNewItemModal(true)}
                  className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Nouvelle
                </button>
                {selectedFir && (
                  <button onClick={() => deleteItem('fir', selectedFir)}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" /> Supprimer
                  </button>
                )}
              </div>
              {currentSelectedFir && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400 text-sm">Couleur :</span>
                  {FIR_COLORS.map((c, i) => (
                    <button key={i} onClick={() => updateFirColor(currentSelectedFir.id, c.color, c.borderColor)}
                      className={`w-6 h-6 rounded border-2 ${currentSelectedFir.borderColor === c.borderColor ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c.borderColor }}
                      title={c.name}
                    />
                  ))}
                </div>
              )}
              <p className="text-amber-400/70 text-sm">
                {selectedFir ? 'Cliquez sur la carte pour ajouter des points. Glissez les points pour les déplacer.' : 'Sélectionnez ou créez une zone FIR pour la modifier.'}
              </p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'carte' ? (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Carte SVG */}
          <div className="lg:col-span-2 card p-0 overflow-hidden relative bg-[#1a2e4a]">
            {/* Contrôles de zoom */}
            {!isAdminMode && (
              <div className="absolute top-3 right-3 z-30 flex flex-col gap-1">
                <button onClick={handleZoomIn} className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg" title="Zoomer">
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button onClick={handleZoomOut} className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg" title="Dézoomer">
                  <ZoomOut className="h-4 w-4" />
                </button>
                {zoom !== 1 && (
                  <button onClick={handleResetView} className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg" title="Réinitialiser">
                    <Move className="h-4 w-4" />
                  </button>
                )}
                <div className="text-center text-xs text-slate-400 bg-slate-800/90 rounded px-2 py-1">
                  {Math.round(zoom * 100)}%
                </div>
              </div>
            )}

            <div 
              ref={mapContainerRef}
              className="relative w-full overflow-hidden"
              style={{ 
                aspectRatio: '1024/787',
                cursor: isAdminMode ? (draggingAeroport || draggingPoint ? 'grabbing' : 'crosshair') : (zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default')
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                className="absolute inset-0 transition-transform duration-100"
                style={{
                  transform: isAdminMode ? 'none' : `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  transformOrigin: 'center center'
                }}
              >
                {/* SVG Carte */}
                <svg 
                  ref={svgRef}
                  viewBox="0 0 1024 787" 
                  className="absolute inset-0 w-full h-full"
                  style={{ background: 'linear-gradient(180deg, #1a3a5f 0%, #1a2e4a 50%, #162540 100%)' }}
                  onClick={handleSvgClick}
                >
                  {/* Grille */}
                  <defs>
                    <pattern id="smallGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2a4a6a" strokeWidth="0.5" opacity="0.5"/>
                    </pattern>
                    <pattern id="largeGrid" width="200" height="200" patternUnits="userSpaceOnUse">
                      <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#2a4a6a" strokeWidth="1" opacity="0.8"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#smallGrid)" />
                  <rect width="100%" height="100%" fill="url(#largeGrid)" />

                  {/* FIR Zones */}
                  {(showFIR || isAdminMode) && firZones.map((fir) => {
                    const pointsStr = fir.points.map(p => `${p.x},${p.y}`).join(' ');
                    const isSelected = selectedFir === fir.id;
                    const centerX = fir.points.reduce((s, p) => s + p.x, 0) / fir.points.length;
                    const centerY = fir.points.reduce((s, p) => s + p.y, 0) / fir.points.length;
                    
                    return (
                      <g key={fir.id}>
                        <polygon
                          points={pointsStr}
                          fill={fir.color}
                          stroke={isSelected ? '#fff' : fir.borderColor}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray={isSelected ? 'none' : '10,5'}
                          onClick={(e) => { if (isAdminMode && adminEditMode === 'fir') { e.stopPropagation(); setSelectedFir(fir.id); }}}
                          style={{ cursor: isAdminMode && adminEditMode === 'fir' ? 'pointer' : 'default' }}
                        />
                        {!isAdminMode && (
                          <text x={centerX} y={centerY} fill={fir.borderColor} fontSize="14" fontFamily="monospace" fontWeight="bold" textAnchor="middle" opacity="0.7">
                            {fir.name}
                          </text>
                        )}
                        {/* Points de contrôle en mode édition */}
                        {isAdminMode && adminEditMode === 'fir' && isSelected && fir.points.map((point, idx) => (
                          <circle
                            key={idx}
                            cx={point.x}
                            cy={point.y}
                            r="8"
                            fill={fir.borderColor}
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'grab' }}
                            onMouseDown={(e) => { e.stopPropagation(); setDraggingPoint({ type: 'fir', id: fir.id, pointIndex: idx }); }}
                            onContextMenu={(e) => { e.preventDefault(); deletePoint('fir', fir.id, idx); }}
                          />
                        ))}
                      </g>
                    );
                  })}

                  {/* Îles */}
                  {(showIslands || isAdminMode) && islands.map((island) => {
                    const pointsStr = island.points.map(p => `${p.x},${p.y}`).join(' ');
                    const isSelected = selectedIsland === island.id;
                    
                    return (
                      <g key={island.id}>
                        <polygon
                          points={pointsStr}
                          fill={island.fill}
                          stroke={isSelected ? '#fff' : island.stroke}
                          strokeWidth={isSelected ? 3 : 2}
                          onClick={(e) => { if (isAdminMode && adminEditMode === 'islands') { e.stopPropagation(); setSelectedIsland(island.id); }}}
                          style={{ cursor: isAdminMode && adminEditMode === 'islands' ? 'pointer' : 'default' }}
                        />
                        {/* Points de contrôle en mode édition */}
                        {isAdminMode && adminEditMode === 'islands' && isSelected && island.points.map((point, idx) => (
                          <circle
                            key={idx}
                            cx={point.x}
                            cy={point.y}
                            r="6"
                            fill="#fff"
                            stroke={island.fill}
                            strokeWidth="2"
                            style={{ cursor: 'grab' }}
                            onMouseDown={(e) => { e.stopPropagation(); setDraggingPoint({ type: 'island', id: island.id, pointIndex: idx }); }}
                            onContextMenu={(e) => { e.preventDefault(); deletePoint('island', island.id, idx); }}
                          />
                        ))}
                      </g>
                    );
                  })}

                  {/* Waypoints */}
                  {showWaypoints && !isAdminMode && WAYPOINTS.map((wp, idx) => (
                    <g key={idx} transform={`translate(${wp.x * 10.24}, ${wp.y * 7.87})`}>
                      <polygon points="0,-6 5,4 -5,4" fill="#84cc16" stroke="#65a30d" strokeWidth="1" opacity="0.8"/>
                      <text x="8" y="3" fill="#a3e635" fontSize="8" fontFamily="monospace" opacity="0.7">{wp.code}</text>
                    </g>
                  ))}

                  {/* VOR/DME */}
                  {showVOR && !isAdminMode && VORS.map((vor, idx) => (
                    <g key={idx} transform={`translate(${vor.x * 10.24}, ${vor.y * 7.87})`}>
                      <circle r="12" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.6"/>
                      <circle r="4" fill="#22d3ee" opacity="0.8"/>
                      <line x1="-12" y1="0" x2="12" y2="0" stroke="#22d3ee" strokeWidth="1" opacity="0.4"/>
                      <line x1="0" y1="-12" x2="0" y2="12" stroke="#22d3ee" strokeWidth="1" opacity="0.4"/>
                      <text x="0" y="-18" fill="#22d3ee" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">{vor.code}</text>
                      <text x="0" y="28" fill="#67e8f9" fontSize="7" fontFamily="monospace" textAnchor="middle" opacity="0.8">{vor.freq}</text>
                    </g>
                  ))}

                  {/* Aéroports */}
                  {aeroports.map((aeroport) => {
                    const pos = positions[aeroport.code];
                    if (!pos) return null;
                    const ratio = getPassagerRatio(aeroport);
                    const isSelected = selectedAeroport?.code === aeroport.code;
                    const color = TAILLE_SVG_COLORS[aeroport.taille];
                    const x = pos.x * 10.24;
                    const y = pos.y * 7.87;
                    const showAirportAdmin = isAdminMode && adminEditMode === 'airports';
                    
                    return (
                      <g 
                        key={aeroport.code} 
                        transform={`translate(${x}, ${y})`}
                        style={{ cursor: showAirportAdmin ? 'grab' : 'pointer' }}
                        onMouseDown={(e) => {
                          if (showAirportAdmin) {
                            e.stopPropagation();
                            setDraggingAeroport(aeroport.code);
                          }
                        }}
                        onClick={() => !isAdminMode && setSelectedAeroport(aeroport)}
                      >
                        {isSelected && !isAdminMode && <circle r="16" fill="none" stroke="white" strokeWidth="2" opacity="0.8"/>}
                        <circle r="8" fill={color} stroke="white" strokeWidth="2" style={{ filter: isSelected ? 'drop-shadow(0 0 6px white)' : 'none' }}/>
                        {!isAdminMode && (
                          <circle cx="6" cy="6" r="4" fill={ratio >= 0.7 ? '#10b981' : ratio >= 0.4 ? '#f59e0b' : '#ef4444'} stroke="white" strokeWidth="1"/>
                        )}
                        <text y="22" fill={showAirportAdmin ? '#fbbf24' : '#4ade80'} fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle"
                          style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: '3px' }}
                        >
                          {aeroport.code}
                        </text>
                        {aeroport.tourisme && !isAdminMode && <text x="10" y="-8" fontSize="12">🏝️</text>}
                      </g>
                    );
                  })}

                  {/* Titre */}
                  <rect x="10" y="10" width="150" height="50" rx="8" fill="rgba(15,23,42,0.9)" stroke="#334155" strokeWidth="1"/>
                  <text x="20" y="32" fill="#4ade80" fontSize="14" fontFamily="monospace" fontWeight="bold">
                    {isAdminMode ? 'Mode Éditeur' : 'Carte PTFS'}
                  </text>
                  <text x="20" y="48" fill="#64748b" fontSize="10" fontFamily="sans-serif">
                    {aeroports.length} aéroports
                  </text>
                </svg>
              </div>
            </div>

            {zoom > 1 && !isAdminMode && (
              <div className="absolute bottom-3 left-3 text-xs text-slate-400 bg-slate-900/80 px-2 py-1 rounded">
                Glissez pour naviguer
              </div>
            )}
          </div>

          {/* Panel détails */}
          <div className="card">
            {isAdminMode ? (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-purple-300">Instructions</h3>
                {adminEditMode === 'airports' && (
                  <div className="space-y-3 text-sm text-slate-400">
                    <p>1. Glissez-déposez les points colorés</p>
                    <p>2. Alignez-les sur les positions correctes</p>
                    <p>3. Cliquez sur &quot;Copier le code&quot;</p>
                    <p>4. Envoyez-moi le code copié</p>
                  </div>
                )}
                {adminEditMode === 'islands' && (
                  <div className="space-y-3 text-sm text-slate-400">
                    <p>1. Sélectionnez une île ou créez-en une</p>
                    <p>2. Cliquez sur la carte pour ajouter des points</p>
                    <p>3. Glissez les points blancs pour les déplacer</p>
                    <p>4. Clic droit sur un point pour le supprimer</p>
                    <p>5. Choisissez une couleur</p>
                    <p>6. Cliquez sur &quot;Copier le code&quot;</p>
                  </div>
                )}
                {adminEditMode === 'fir' && (
                  <div className="space-y-3 text-sm text-slate-400">
                    <p>1. Sélectionnez une FIR ou créez-en une</p>
                    <p>2. Cliquez sur la carte pour ajouter des points</p>
                    <p>3. Glissez les points pour les déplacer</p>
                    <p>4. Clic droit sur un point pour le supprimer</p>
                    <p>5. Choisissez une couleur</p>
                    <p>6. Cliquez sur &quot;Copier le code&quot;</p>
                  </div>
                )}
                <div className="border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Légende aéroports</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-purple-500"></div>
                      <span className="text-slate-400">International</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-sky-500"></div>
                      <span className="text-slate-400">Régional</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
                      <span className="text-slate-400">Petit</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-red-500"></div>
                      <span className="text-slate-400">Militaire</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedAeroport ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 font-mono">{selectedAeroport.code}</h3>
                    <p className="text-slate-400">{selectedAeroport.nom}</p>
                  </div>
                  {selectedAeroport.tourisme && <span className="text-2xl">🏝️</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[selectedAeroport.taille].split(' ')[0]}`}></div>
                  <span className="text-slate-300">{TAILLE_LABELS[selectedAeroport.taille]}</span>
                </div>
                {selectedAeroport.vor && (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                    <div className="flex items-center gap-2 text-cyan-300">
                      <Radio className="h-4 w-4" />
                      <span className="font-mono font-bold">{selectedAeroport.vor}</span>
                      {selectedAeroport.freq && <span className="text-cyan-400/70">{selectedAeroport.freq} MHz</span>}
                    </div>
                  </div>
                )}
                <div className={`p-4 rounded-lg ${getPassagerBgColor(getPassagerRatio(selectedAeroport))}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-5 w-5 text-slate-400" />
                    <span className="text-slate-300 font-medium">Passagers disponibles</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${getPassagerColor(getPassagerRatio(selectedAeroport))}`}>
                      {selectedAeroport.passagers_disponibles.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-slate-500">/ {selectedAeroport.passagers_max.toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${
                      getPassagerRatio(selectedAeroport) >= 0.7 ? 'bg-emerald-500' :
                      getPassagerRatio(selectedAeroport) >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                    }`} style={{ width: `${getPassagerRatio(selectedAeroport) * 100}%` }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-400">Bonus & Malus</h4>
                  <div className="space-y-1 text-sm">
                    {selectedAeroport.taille === 'international' && (
                      <div className="flex items-center gap-2 text-purple-300">
                        <TrendingUp className="h-4 w-4" /><span>Prix billet: -40% d&apos;impact</span>
                      </div>
                    )}
                    {selectedAeroport.taille === 'regional' && (
                      <div className="flex items-center gap-2 text-sky-300">
                        <TrendingUp className="h-4 w-4" /><span>Prix billet: -20% d&apos;impact</span>
                      </div>
                    )}
                    {selectedAeroport.taille === 'military' && (
                      <div className="flex items-center gap-2 text-red-300">
                        <Plane className="h-4 w-4" /><span>Peu de passagers civils</span>
                      </div>
                    )}
                    {selectedAeroport.tourisme && (
                      <div className="flex items-center gap-2 text-amber-300">
                        <span>🏝️</span><span>Touristique: +15% remplissage</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <MapPin className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Cliquez sur un aéroport</p>
                <p className="text-slate-500 text-sm mt-1">pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="pb-3 pr-4">Aéroport</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">VOR</th>
                  <th className="pb-3 pr-4">Passagers</th>
                  <th className="pb-3 pr-4">Remplissage</th>
                  <th className="pb-3">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {aeroportsTries.map((aeroport) => {
                  const ratio = getPassagerRatio(aeroport);
                  return (
                    <tr key={aeroport.code} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => { setSelectedAeroport(aeroport); setViewMode('carte'); }}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-green-400">{aeroport.code}</span>
                          <span className="text-slate-400 truncate max-w-[150px]">{aeroport.nom}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[aeroport.taille].split(' ')[0]}`}></div>
                          <span className="text-slate-300 text-xs">{TAILLE_LABELS[aeroport.taille]}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {aeroport.vor ? (
                          <span className="font-mono text-cyan-400 text-xs">{aeroport.vor} {aeroport.freq}</span>
                        ) : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`font-bold ${getPassagerColor(ratio)}`}>
                          {aeroport.passagers_disponibles.toLocaleString('fr-FR')}
                        </span>
                        <span className="text-slate-500 text-xs"> / {aeroport.passagers_max.toLocaleString('fr-FR')}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full ${ratio >= 0.7 ? 'bg-emerald-500' : ratio >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${ratio * 100}%` }}></div>
                          </div>
                          <span className={`text-xs ${getPassagerColor(ratio)}`}>{Math.round(ratio * 100)}%</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {aeroport.tourisme && <span title="Touristique">🏝️</span>}
                          {aeroport.taille === 'international' && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">-40%</span>}
                          {aeroport.taille === 'regional' && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-300">-20%</span>}
                          {aeroport.taille === 'military' && <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-300">Mil.</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-purple-500/10 border-purple-500/30">
          <p className="text-sm text-purple-300">Internationaux</p>
          <p className="text-2xl font-bold text-purple-400">{aeroports.filter(a => a.taille === 'international').length}</p>
        </div>
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <p className="text-sm text-emerald-300">Passagers disponibles</p>
          <p className="text-2xl font-bold text-emerald-400">{aeroports.reduce((sum, a) => sum + a.passagers_disponibles, 0).toLocaleString('fr-FR')}</p>
        </div>
        <div className="card bg-amber-500/10 border-amber-500/30">
          <p className="text-sm text-amber-300">Touristiques</p>
          <p className="text-2xl font-bold text-amber-400">{aeroports.filter(a => a.tourisme).length}</p>
        </div>
        <div className="card bg-cyan-500/10 border-cyan-500/30">
          <p className="text-sm text-cyan-300">Avec VOR/DME</p>
          <p className="text-2xl font-bold text-cyan-400">{aeroports.filter(a => a.vor).length}</p>
        </div>
      </div>
    </div>
  );
}
