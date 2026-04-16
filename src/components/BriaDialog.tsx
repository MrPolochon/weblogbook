'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Phone, PhoneOff, Radio, Send, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { AEROPORTS_PTFS, calculerCoefficientRemplissage, calculerCoefficientChargementCargo, genererTypeCargaison, genererTypeCargaisonComplementaire, getCargaisonInfo, getMarchandiseRareAleatoire } from '@/lib/aeroports-ptfs';
import { playPhoneRing, playPhoneEnd } from '@/lib/phone-sounds';
import { joinSidStarRoute, isIOS } from '@/lib/utils';
import { speakAndWait as ttsSpeak, textePourTTS as ttsTextePourTTS, cancelSpeech } from '@/lib/tts';

// ─── Types ───

type BriaMessage = { role: 'bria' | 'pilote'; text: string };

type AircraftInfo = {
  source: 'compagnie' | 'personnel';
  compagnie_avion_id?: string;
  inventaire_avion_id?: string;
  compagnie_id?: string;
  compagnie_nom?: string;
  compagnie_code_oaci?: string;
  immatriculation: string;
  nom_bapteme?: string;
  nom_personnalise?: string;
  aeroport_actuel: string;
  statut: string;
  usure_percent: number;
  type_avion_nom: string;
  type_avion_code_oaci?: string;
  type_avion_constructeur?: string;
  capacite_pax: number;
  capacite_cargo_kg: number;
  prix_billet_pax?: number;
  prix_kg_cargo?: number;
  pourcentage_salaire?: number;
};

type StepId =
  | 'greeting' | 'choice'
  | 'immat' | 'confirm_aircraft' | 'regime_vol'
  | 'heure_depart' | 'confirm_heure'
  | 'aeroport_depart' | 'confirm_dep' | 'aeroport_arrivee' | 'confirm_arr'
  | 'temps_vol' | 'confirm_temps'
  | 'autonomie' | 'confirm_autonomie'
  | 'nb_personnes' | 'confirm_personnes'
  | 'vol_type' | 'vol_prive_confirm' | 'nature_transport' | 'confirm_vol_type'
  | 'sid' | 'confirm_sid' | 'star' | 'confirm_star'
  | 'altitude' | 'confirm_altitude'
  | 'numero_vol' | 'confirm_numero'
  | 'quoi_ciel'
  | 'resume' | 'submitting' | 'done' | 'error';

interface BriaState {
  mode: 'intention' | 'plan' | null;
  immatriculation: string;
  aircraft: AircraftInfo | null;
  type_vol: 'VFR' | 'IFR';
  heure_depart: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  temps_prev_min: string;
  autonomie: string;
  nb_personnes: string;
  vol_commercial: boolean;
  vol_ferry: boolean;
  nature_transport: 'passagers' | 'cargo';
  sid_depart: string;
  star_arrivee: string;
  altitude_croisiere: string;
  numero_vol: string;
  quoi_ciel: string;
}

const INITIAL_STATE: BriaState = {
  mode: null, immatriculation: '', aircraft: null,
  type_vol: 'VFR', heure_depart: '', aeroport_depart: '', aeroport_arrivee: '',
  temps_prev_min: '', autonomie: '', nb_personnes: '',
  vol_commercial: false, vol_ferry: false, nature_transport: 'passagers',
  sid_depart: '', star_arrivee: '', altitude_croisiere: '', numero_vol: '',
  quoi_ciel: '',
};

// ─── TTS helper (module partagé avec AtcTelephone) ───
const textePourTTS = ttsTextePourTTS;

function speakAndWait(text: string): Promise<void> {
  return ttsSpeak(text);
}

function getAeroportNom(code: string) {
  return AEROPORTS_PTFS.find(a => a.code === code)?.nom || code;
}

// ─── Sons téléphone (réutilise ATC/SIAVI via lib/phone-sounds) ───

/** Sonnerie BRIA : même son que téléphone ATC/SIAVI, répété pendant 2 s. Retourne cancel() pour arrêter immédiatement. */
function playRingSound(): { promise: Promise<void>; cancel: () => void } {
  let interval: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => { resolve = r; });
  const cancel = () => {
    if (interval) { clearInterval(interval); interval = null; }
    if (timeout) { clearTimeout(timeout); timeout = null; }
    resolve();
  };
  playPhoneRing();
  interval = setInterval(() => { playPhoneRing(); }, 600);
  timeout = setTimeout(() => { cancel(); }, 2000);
  return { promise, cancel };
}

// ─── Cooldown BRIA (export pour vérification avant ouverture) ───
export const BRIA_COOLDOWN_KEY = 'bria_cooldown_until';
export function getBriaCooldownRemaining(): number {
  if (typeof window === 'undefined') return 0;
  const until = parseInt(localStorage.getItem(BRIA_COOLDOWN_KEY) || '0', 10);
  return Math.max(0, until - Date.now());
}

function setBriaCooldown() {
  if (typeof window === 'undefined') return;
  const minMs = 60 * 1000;
  const maxMs = 5 * 60 * 1000;
  const duration = minMs + Math.floor(Math.random() * (maxMs - minMs));
  localStorage.setItem(BRIA_COOLDOWN_KEY, String(Date.now() + duration));
}

// Messages d'escalade quand mauvais aéroport de départ (avion compagnie)
const WRONG_AIRPORT_MESSAGES = [
  "Tu me prends pour une truite ? L'avion est à {pos}, pas à {sel}. Quel est votre aéroport de départ ?",
  "Tu es débile ou quoi ? L'avion est à {pos}. Quel est votre aéroport de départ ?",
  "C'est pas compliqué : l'avion est à {pos}. Répondez correctement.",
  "Dernière chance. Aéroport de départ ? L'avion est à {pos}.",
  "Je vais te reporter au staff Mixou Airlines. Au revoir.",
];

// Commentaires quand l'aéroport est enfin correct après 2, 3 ou 4 erreurs
const CORRECT_AIRPORT_AFTER_WRONG = [
  "Ah bah tu vois, c'est pas compliqué !",
  "Voilà, enfin. L'avion était bien à cet endroit.",
  "Bon, on y est arrivé. Bravo.",
];

// Commentaires quand l'heure est enfin correcte après 2, 3 ou 4 erreurs
const CORRECT_HEURE_AFTER_WRONG = [
  "Ah bah tu vois, quand même !",
  "Et voilà. Une heure dans le futur, c'est pas sorcier.",
  "Enfin une heure qui tient la route.",
];

// Relances inactivité : 30s au début, -0.5s à chaque fois jusqu'à 5s
const RELANCE_INITIALE_MS = 30 * 1000;
const RELANCE_DECREMENT_MS = 500;
const RELANCE_MIN_MS = 5 * 1000;

// Messages d'escalade quand heure de départ dans le passé
const WRONG_HEURE_MESSAGES = [
  "Alors toi tu veux partir dans le passé, c'est ça ? Quelle est votre heure de départ souhaitée en UTC ?",
  "Si le vol se passe demain, rappelle-moi demain. Quelle est votre heure de départ en UTC ?",
  "L'heure c'est maintenant ou plus tard, pas avant. Répondez correctement.",
  "Dernière chance. Heure de départ UTC ?",
  "Je vais te reporter au staff Mixou Airlines. Au revoir.",
];

function parseHeureUtc(input: string): { h: number; m: number } | null {
  const s = input.trim().replace(/\s/g, '');
  const matchH = s.match(/^(\d{1,2})[hH](\d{1,2})$/);
  if (matchH) return { h: parseInt(matchH[1], 10), m: parseInt(matchH[2], 10) };
  const matchColon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (matchColon) return { h: parseInt(matchColon[1], 10), m: parseInt(matchColon[2], 10) };
  const match4 = s.match(/^(\d{4})$/);
  if (match4) return { h: parseInt(match4[1].slice(0, 2), 10), m: parseInt(match4[1].slice(2, 4), 10) };
  const match2 = s.match(/^(\d{1,2})$/);
  if (match2) return { h: parseInt(match2[1], 10), m: 0 };
  return null;
}

function isHeureDansLePasse(heureStr: string): boolean {
  const parsed = parseHeureUtc(heureStr);
  if (!parsed || parsed.h < 0 || parsed.h > 23 || parsed.m < 0 || parsed.m > 59) return false;
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const selMin = parsed.h * 60 + parsed.m;
  return selMin < nowMin;
}

function normalizeHeureUtc(heureStr: string): string | null {
  const parsed = parseHeureUtc(heureStr);
  if (!parsed) return null;
  if (parsed.h < 0 || parsed.h > 23 || parsed.m < 0 || parsed.m > 59) return null;
  return `${String(parsed.h).padStart(2, '0')}:${String(parsed.m).padStart(2, '0')}`;
}

function parseStrictPositiveInt(input: string): number | null {
  const clean = input.trim();
  if (!/^\d+$/.test(clean)) return null;
  const n = parseInt(clean, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeAirportCode(input: string): string {
  return input.trim().toUpperCase();
}

function isKnownAirportCode(code: string): boolean {
  return AEROPORTS_PTFS.some((a) => a.code === code);
}

function normalizeAltitude(input: string): string | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;
  const flMatch = raw.match(/^FL\s*(\d{2,3})$/i);
  if (flMatch) return `FL${flMatch[1]}`;
  const ftMatch = raw.match(/^(\d{3,5})\s*F?T?$/i);
  if (ftMatch) return ftMatch[1];
  return null;
}

function normalizeIndicatif(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

// ─── Component ───

interface BriaDialogProps {
  onClose: () => void;
}

export default function BriaDialog({ onClose }: BriaDialogProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<BriaMessage[]>([]);
  const [step, setStep] = useState<StepId>('greeting');
  const [ctx, setCtx] = useState<BriaState>(INITIAL_STATE);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [showSidStarPanel, setShowSidStarPanel] = useState(false);
  const [sidStarList, setSidStarList] = useState<{ id: string; nom: string; route: string }[]>([]);
  const [sidStarLoading, setSidStarLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasGreeted = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const relaunchAtRef = useRef<number | null>(null);
  const wrongAirportCountRef = useRef(0);
  const wrongHeureCountRef = useRef(0);
  const relaunchCountRef = useRef(0);
  const closedRef = useRef(false);
  const ringCancelRef = useRef<(() => void) | null>(null);
  const ttsEnabledRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled(prev => {
      const next = !prev;
      ttsEnabledRef.current = next;
      if (!next) cancelSpeech();
      return next;
    });
  }, []);

  const addBria = useCallback((text: string, delay = 600, speakText?: string) => {
    if (closedRef.current) return Promise.resolve();
    setIsTyping(true);
    const toSpeak = speakText ?? text;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        if (closedRef.current) {
          setIsTyping(false);
          return resolve();
        }
        setMessages(prev => [...prev, { role: 'bria', text }]);
        scrollToBottom();
        if (ttsEnabledRef.current) {
          speakAndWait(toSpeak).finally(() => {
            if (!closedRef.current) setIsTyping(false);
            resolve();
          });
        } else {
          setTimeout(() => {
            if (!closedRef.current) setIsTyping(false);
            resolve();
          }, 400);
        }
      }, delay);
    });
  }, [scrollToBottom]);

  const addPilote = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: 'pilote', text }]);
    scrollToBottom();
  }, [scrollToBottom]);

  // Fermer le panel SID/STAR quand on change d'étape
  useEffect(() => {
    if (step !== 'sid' && step !== 'star') setShowSidStarPanel(false);
  }, [step]);

  // Vérifier cooldown au montage (sécurité si ouverture directe)
  useEffect(() => {
    const remaining = getBriaCooldownRemaining();
    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      toast.error(`Vous ne pouvez pas appeler le BRIA avant ${mins} minute${mins > 1 ? 's' : ''}.`);
      onClose();
    }
  }, [onClose]);

  // Fermer avec son raccrochage (même que téléphone ATC/SIAVI) — met fin à tout
  const handleClose = useCallback(() => {
    closedRef.current = true;
    ringCancelRef.current?.();
    ringCancelRef.current = null;
    cancelSpeech();
    playPhoneEnd();
    onClose();
  }, [onClose]);

  // ─── Greeting on mount : sonnerie + timer 0-10s avant que le BRIA réponde ───
  useEffect(() => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;
    (async () => {
      if (closedRef.current) return;
      const { promise, cancel } = playRingSound();
      ringCancelRef.current = cancel;
      await promise;
      ringCancelRef.current = null;
      if (closedRef.current) return;
      const delayMs = Math.floor(Math.random() * 11) * 1000; // 0 à 10 secondes
      await new Promise((r) => setTimeout(r, delayMs));
      if (closedRef.current) return;
      await addBria('B. R. I. A, bonjour.', 500);
      if (closedRef.current) return;
      await addBria("C'est pour quoi ?", 1000);
      if (closedRef.current) return;
      setStep('choice');
    })();
    return () => {
      closedRef.current = true;
      ringCancelRef.current?.();
      ringCancelRef.current = null;
      cancelSpeech();
    };
  }, [addBria]);

  // Focus input when step changes (iOS : délai pour que le clavier s'ouvre correctement)
  useEffect(() => {
    if (!isTyping && inputRef.current) {
      const delay = isIOS() ? 150 : 0;
      const t = setTimeout(() => inputRef.current?.focus({ preventScroll: isIOS() }), delay);
      return () => clearTimeout(t);
    }
  }, [step, isTyping]);

  // Relances en cas d'inactivité
  useEffect(() => {
    const interval = setInterval(() => {
      if (step === 'done' || step === 'error' || step === 'submitting') return;
      if (isTyping) return; // Ne pas compter quand BRIA parle
      const now = Date.now();
      const refTime = relaunchAtRef.current ?? lastActivityRef.current;
      const elapsed = now - refTime;
      const nextInterval = Math.max(RELANCE_MIN_MS, RELANCE_INITIALE_MS - relaunchCountRef.current * RELANCE_DECREMENT_MS);

      if (elapsed >= nextInterval) {
        if (relaunchCountRef.current > 0 && nextInterval <= RELANCE_MIN_MS) {
          // Déjà à 5s, on raccroche
          handleClose();
        } else {
          relaunchAtRef.current = now;
          relaunchCountRef.current += 1;
          setMessages(prev => [...prev, { role: 'bria', text: "Êtes-vous toujours là ?" }]);
          speakAndWait("Êtes-vous toujours là ?");
        }
      }
    }, 2000); // Vérifier toutes les 2 s
    return () => clearInterval(interval);
  }, [step, isTyping, handleClose]);

  // ─── Aircraft lookup ───
  const lookupAircraft = useCallback(async (immat: string): Promise<AircraftInfo | null> => {
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/avions/lookup?immatriculation=${encodeURIComponent(immat)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = res.status === 403 && d.error_detail
          ? d.error_detail
          : (d.error || "Je ne trouve pas cet avion. Vérifiez l'immatriculation.");
        await addBria(msg, 600);
        return null;
      }
      return await res.json();
    } catch {
      await addBria("Erreur de communication. Réessayez.", 400);
      return null;
    } finally {
      setLookupLoading(false);
    }
  }, [addBria]);

  // ─── Handle answer for each step ───
  const handleAnswer = useCallback(async (value: string) => {
    if (isTyping || lookupLoading) return;
    const v = value.trim();
    if (!v) return;
    lastActivityRef.current = Date.now();
    if (relaunchAtRef.current !== null) {
      relaunchAtRef.current = null;
      relaunchCountRef.current = 0; // Utilisateur a répondu, on repart de zéro
      setInputValue('');
      return; // On ignore l'input, on reprend la conversation
    }
    setInputValue('');

    switch (step) {
      case 'choice': {
        addPilote(v === 'intention' ? 'Intention de vol' : 'Plan de vol');
        const mode = v === 'intention' ? 'intention' : 'plan';
        setCtx(prev => ({ ...prev, mode }));
        await addBria("Quelle est l'immatriculation de l'appareil ?");
        setStep('immat');
        break;
      }

      case 'immat': {
        const immat = v.toUpperCase();
        addPilote(immat);
        setCtx(prev => ({ ...prev, immatriculation: immat }));
        const ac = await lookupAircraft(immat);
        if (!ac) { setStep('immat'); break; }
        setCtx(prev => ({ ...prev, aircraft: ac }));

        const locStr = (ac.source !== 'personnel' && ac.aeroport_actuel) ? ` au parking sur ${getAeroportNom(ac.aeroport_actuel)}` : '';
        const compStr = ac.source === 'compagnie' && ac.compagnie_nom ? `, appartenant à ${ac.compagnie_nom}` : '';
        const label = ac.type_avion_nom || 'avion';
        await addBria(`Il s'agit bien d'un ${label} immatriculé ${ac.immatriculation}${locStr}${compStr} ?`);
        setStep('confirm_aircraft');
        break;
      }

      case 'confirm_aircraft': {
        addPilote(v === 'oui' ? 'Affirm' : 'Négatif');
        if (v === 'non') {
          await addBria("Quelle est l'immatriculation de l'appareil ?");
          setCtx(prev => ({ ...prev, aircraft: null, immatriculation: '' }));
          setStep('immat');
        } else {
          await addBria('Quel est le régime de vol ? VFR ou IFR ?');
          setStep('regime_vol');
        }
        break;
      }

      case 'regime_vol': {
        const regimeRaw = v.toUpperCase();
        const regime = regimeRaw === 'IFR' || regimeRaw === 'VFR' ? regimeRaw : null;
        if (!regime) {
          addPilote(v);
          await addBria("Réponse invalide. Répondez uniquement VFR ou IFR.");
          setStep('regime_vol');
          break;
        }
        addPilote(regime);
        setCtx(prev => ({ ...prev, type_vol: regime }));
        await addBria(`${regime}, bien reçu. Quelle est votre heure de départ souhaitée en UTC ?`);
        setStep('heure_depart');
        break;
      }

      case 'heure_depart': {
        const heureNorm = normalizeHeureUtc(v);
        if (!heureNorm) {
          addPilote(v);
          await addBria("Format heure invalide. Utilisez par exemple 14h30, 14:30, 1430 ou 14.");
          setStep('heure_depart');
          break;
        }
        const heureDansLePasse = isHeureDansLePasse(heureNorm);

        if (heureDansLePasse) {
          wrongHeureCountRef.current += 1;
          const idx = Math.min(wrongHeureCountRef.current - 1, WRONG_HEURE_MESSAGES.length - 1);
          const msg = WRONG_HEURE_MESSAGES[idx];
          addPilote(heureNorm);
          await addBria(msg);

          if (idx === WRONG_HEURE_MESSAGES.length - 1) {
            setBriaCooldown();
            handleClose();
            return;
          }
          setStep('heure_depart');
        } else {
          const n = wrongHeureCountRef.current;
          wrongHeureCountRef.current = 0;
          addPilote(heureNorm);
          setCtx(prev => ({ ...prev, heure_depart: heureNorm }));
          if (n >= 2 && n <= 4) {
            const msg = CORRECT_HEURE_AFTER_WRONG[Math.min(n - 2, CORRECT_HEURE_AFTER_WRONG.length - 1)];
            await addBria(msg);
          }
          await addBria(`Heure de départ ${heureNorm} UTC, bien reçu.`);
          await addBria("Quel est votre aéroport de départ ?");
          setStep('aeroport_depart');
        }
        break;
      }

      case 'aeroport_depart': {
        const depCode = normalizeAirportCode(v);
        if (!isKnownAirportCode(depCode)) {
          addPilote(v);
          await addBria("Aéroport invalide. Choisissez un code présent dans la liste.");
          setStep('aeroport_depart');
          break;
        }
        const ac = ctx.aircraft;
        const avionPos = ac?.aeroport_actuel?.trim().toUpperCase();
        const selCode = depCode;
        const isWrongAirport = ac?.source === 'compagnie' && avionPos && selCode !== avionPos;

        if (isWrongAirport) {
          wrongAirportCountRef.current += 1;
          const idx = Math.min(wrongAirportCountRef.current - 1, WRONG_AIRPORT_MESSAGES.length - 1);
          const msg = WRONG_AIRPORT_MESSAGES[idx]
            .replace('{pos}', getAeroportNom(avionPos) || avionPos)
            .replace('{sel}', getAeroportNom(selCode) || selCode);
          addPilote(`${v} — ${getAeroportNom(v)}`);
          await addBria(msg);

          if (idx === WRONG_AIRPORT_MESSAGES.length - 1) {
            setBriaCooldown();
            handleClose();
            return;
          }
          setStep('aeroport_depart');
        } else {
          const n = wrongAirportCountRef.current;
          wrongAirportCountRef.current = 0;
          addPilote(`${depCode} — ${getAeroportNom(depCode)}`);
          setCtx(prev => ({ ...prev, aeroport_depart: depCode }));
          if (n >= 2 && n <= 4) {
            const msg = CORRECT_AIRPORT_AFTER_WRONG[Math.min(n - 2, CORRECT_AIRPORT_AFTER_WRONG.length - 1)];
            await addBria(msg);
          }
          await addBria(`Aéroport de départ ${getAeroportNom(depCode)}, bien reçu.`);
          await addBria("Quel est votre aéroport de destination ?");
          setStep('aeroport_arrivee');
        }
        break;
      }

      case 'aeroport_arrivee': {
        const arrCode = normalizeAirportCode(v);
        if (!isKnownAirportCode(arrCode)) {
          addPilote(v);
          await addBria("Aéroport de destination invalide. Choisissez un code présent dans la liste.");
          setStep('aeroport_arrivee');
          break;
        }
        if (ctx.aeroport_depart && arrCode === ctx.aeroport_depart) {
          addPilote(`${arrCode} — ${getAeroportNom(arrCode)}`);
          await addBria("Départ et destination ne peuvent pas être identiques. Choisissez un autre aéroport d'arrivée.");
          setStep('aeroport_arrivee');
          break;
        }
        addPilote(`${arrCode} — ${getAeroportNom(arrCode)}`);
        setCtx(prev => ({ ...prev, aeroport_arrivee: arrCode }));
        await addBria(`Destination ${getAeroportNom(arrCode)}, bien reçu.`);
        await addBria("Quel est votre temps de vol prévu en minutes ?");
        setStep('temps_vol');
        break;
      }

      case 'temps_vol': {
        const temps = parseStrictPositiveInt(v);
        if (!temps || temps < 5 || temps > 1440) {
          addPilote(v);
          await addBria("Temps de vol invalide. Donnez une valeur entre 5 et 1440 minutes.");
          setStep('temps_vol');
          break;
        }
        addPilote(`${temps} minutes`);
        setCtx(prev => ({ ...prev, temps_prev_min: String(temps) }));
        await addBria(`${temps} minutes de vol prévu, bien reçu.`);
        await addBria("Quelle est votre autonomie totale en minutes ?");
        setStep('autonomie');
        break;
      }

      case 'autonomie': {
        const auto = parseStrictPositiveInt(v);
        const temps = parseStrictPositiveInt(ctx.temps_prev_min) ?? 0;
        if (!auto || auto < 10 || auto > 2880) {
          addPilote(v);
          await addBria("Autonomie invalide. Donnez une valeur entre 10 et 2880 minutes.");
          setStep('autonomie');
          break;
        }
        if (temps > 0 && auto < temps) {
          addPilote(`${auto} minutes`);
          await addBria(`Autonomie insuffisante: ${auto} minutes pour un vol prévu de ${temps} minutes. Corrigez l'autonomie.`);
          setStep('autonomie');
          break;
        }
        addPilote(`${auto} minutes`);
        setCtx(prev => ({ ...prev, autonomie: String(auto) }));
        await addBria(`${auto} minutes d'autonomie, bien reçu.`);
        if (ctx.mode === 'intention') {
          await addBria("Combien de personnes à bord ?");
          setStep('nb_personnes');
        } else if (ctx.aircraft?.source === 'compagnie') {
          await addBria("Est-ce un vol commercial ou un vol ferry ?");
          setStep('vol_type');
        } else {
          await addBria("Est-ce un vol privé ?");
          setStep('vol_prive_confirm');
        }
        break;
      }

      case 'vol_prive_confirm': {
        const isPrive = /^(oui|affirm|yes)$/i.test(v);
        addPilote(isPrive ? 'Affirm' : 'Négatif');
        if (isPrive) {
          setCtx(prev => ({ ...prev, vol_commercial: false, vol_ferry: false }));
          await addBria("Vol privé, bien reçu.");
          await addBria("Combien de personnes à bord ?");
          setStep('nb_personnes');
        } else {
          await addBria("Cet avion n'est pas habilité aux vols commerciaux. J'annule votre demande. Au revoir !");
          handleClose();
        }
        break;
      }

      case 'vol_type': {
        addPilote(v === 'commercial' ? 'Vol commercial' : v === 'ferry' ? 'Vol ferry' : 'Vol privé');
        setCtx(prev => ({
          ...prev,
          vol_commercial: v === 'commercial',
          vol_ferry: v === 'ferry',
        }));
        if (v === 'commercial') {
          await addBria("S'agit-il d'un transport de passagers ou de cargo ?");
          setStep('nature_transport');
        } else {
          await addBria("Combien de personnes à bord ?");
          setStep('nb_personnes');
        }
        break;
      }

      case 'nature_transport': {
        const nature = v as 'passagers' | 'cargo';
        addPilote(nature === 'passagers' ? 'Transport de passagers' : 'Transport de cargo');
        setCtx(prev => ({ ...prev, nature_transport: nature }));

        const ac = ctx.aircraft;
        const ad = ctx.aeroport_depart;
        const aa = ctx.aeroport_arrivee;
        if (ac?.source === 'compagnie' && ac.compagnie_id && ad && aa) {
          let prixBillet = ac.prix_billet_pax ?? 0;
          const prixKgCargo = ac.prix_kg_cargo ?? 0;
          const salairePct = ac.pourcentage_salaire ?? 0;
          const capPax = ac.capacite_pax;
          const capCargo = ac.capacite_cargo_kg;

          // Vérifier s'il existe un tarif spécifique pour cette liaison
          try {
            const tarifRes = await fetch(`/api/tarifs-liaisons?compagnie_id=${ac.compagnie_id}`);
            if (tarifRes.ok) {
              const tarifs = await tarifRes.json();
              if (Array.isArray(tarifs)) {
                const tarifSpec = tarifs.find(
                  (t: { aeroport_depart: string; aeroport_arrivee: string; prix_billet: number }) =>
                    t.aeroport_depart === ad && t.aeroport_arrivee === aa
                );
                if (tarifSpec) prixBillet = tarifSpec.prix_billet;
              }
            }
          } catch { /* fallback au prix par défaut */ }

          const estimLines: string[] = [];
          estimLines.push('── Estimation revenus ──');
          let revenuBrut = 0;
          let cargoKg = 0;

          if (nature === 'passagers' && capPax > 0) {
            const coef = calculerCoefficientRemplissage(ad, aa, prixBillet);
            const nbPax = Math.min(Math.floor(capPax * Math.min(coef, 1.0)), capPax);
            const taux = Math.round((nbPax / capPax) * 100);
            const revPax = nbPax * prixBillet;
            estimLines.push(`${nbPax} passagers @ ${prixBillet} F$  —  Remplissage : ${nbPax}/${capPax} (${taux}%)`);
            revenuBrut += revPax;
            if (capCargo > 0) {
              const coefC = calculerCoefficientChargementCargo(ad, aa, prixKgCargo);
              cargoKg = Math.min(Math.floor(capCargo * Math.min(coefC, 1.0)), capCargo);
              const revCargo = cargoKg * prixKgCargo;
              estimLines.push(`+ ${cargoKg} kg cargo complémentaire @ ${prixKgCargo} F$/kg`);
              revenuBrut += revCargo;
            }
          } else if (nature === 'cargo' && capCargo > 0) {
            const coefC = calculerCoefficientChargementCargo(ad, aa, prixKgCargo);
            cargoKg = Math.min(Math.floor(capCargo * Math.min(coefC, 1.0)), capCargo);
            const taux = Math.round((cargoKg / capCargo) * 100);
            const revCargo = cargoKg * prixKgCargo;
            estimLines.push(`${cargoKg} kg cargo @ ${prixKgCargo} F$/kg  —  Chargement : ${cargoKg}/${capCargo} (${taux}%)`);
            revenuBrut += revCargo;
          }

          const salaire = Math.floor(revenuBrut * (salairePct / 100));
          estimLines.push(`Revenu brut : ${revenuBrut.toLocaleString('fr-FR')} F$`);
          estimLines.push(`Votre salaire (${salairePct}%) : ${salaire.toLocaleString('fr-FR')} F$`);

          // Texte lu par le BRIA : uniquement revenu brut, salaire, et cargaison spéciale si applicable
          let speakText = `Estimation revenus. Revenu brut : ${revenuBrut.toLocaleString('fr-FR')} F$. Votre salaire : ${salaire.toLocaleString('fr-FR')} F$.`;
          if (cargoKg > 0) {
            const typeCargo = nature === 'passagers' ? genererTypeCargaisonComplementaire() : genererTypeCargaison();
            if (typeCargo === 'marchandise_rare') {
              speakText += ` Avec ${getMarchandiseRareAleatoire().toLowerCase()}.`;
            } else if (typeCargo !== 'general') {
              const info = getCargaisonInfo(typeCargo);
              speakText += ` Avec ${info.nom.toLowerCase()}.`;
            }
          }
          await addBria(estimLines.join('\n'), 600, speakText);
        } else {
          await addBria(`Transport de ${nature}, bien reçu.`);
        }

        if (ctx.type_vol === 'IFR') {
          await addBria(`Quelle est la SID de départ depuis ${getAeroportNom(ctx.aeroport_depart)} ?`);
          setStep('sid');
        } else {
          await addBria("Quelle est votre altitude de croisière ?");
          setStep('altitude');
        }
        break;
      }

      case 'nb_personnes': {
        const nb = parseStrictPositiveInt(v);
        if (!nb || nb > 1000) {
          addPilote(v);
          await addBria("Nombre de personnes invalide. Donnez une valeur entre 1 et 1000.");
          setStep('nb_personnes');
          break;
        }
        addPilote(`${nb} personne${nb > 1 ? 's' : ''}`);
        setCtx(prev => ({ ...prev, nb_personnes: String(nb) }));
        await addBria(`${nb} personne${nb > 1 ? 's' : ''} à bord, bien reçu.`);
        if (ctx.mode === 'intention') {
          setStep('resume');
          await showResume();
        } else {
          if (ctx.type_vol === 'IFR') {
            await addBria(`Quelle est la SID de départ depuis ${getAeroportNom(ctx.aeroport_depart)} ?`);
            setStep('sid');
          } else {
            await addBria("Quelle est votre altitude de croisière ?");
            setStep('altitude');
          }
        }
        break;
      }

      case 'sid': {
        addPilote(v);
        setCtx(prev => ({ ...prev, sid_depart: v.toUpperCase() }));
        await addBria(`SID ${v.toUpperCase()}, bien reçu.`);
        await addBria(`Quelle est la STAR d'arrivée à ${getAeroportNom(ctx.aeroport_arrivee)} ?`);
        setStep('star');
        break;
      }

      case 'star': {
        addPilote(v);
        setCtx(prev => ({ ...prev, star_arrivee: v.toUpperCase() }));
        await addBria(`STAR ${v.toUpperCase()}, bien reçu.`);
        await addBria("Quelle est votre altitude de croisière ?");
        setStep('altitude');
        break;
      }

      case 'altitude': {
        const altNorm = normalizeAltitude(v);
        if (!altNorm) {
          addPilote(v);
          await addBria("Altitude invalide. Utilisez FL350, 3500 ou 3500FT.");
          setStep('altitude');
          break;
        }
        addPilote(altNorm);
        setCtx(prev => ({ ...prev, altitude_croisiere: altNorm }));
        await addBria(`Altitude ${altNorm}, bien reçu.`);
        await addBria("Quel est votre numéro de vol ou indicatif d'appel ?");
        setStep('numero_vol');
        break;
      }

      case 'numero_vol': {
        const numero = normalizeIndicatif(v);
        if (numero.length < 2 || numero.length > 16) {
          addPilote(v);
          await addBria("Indicatif invalide. Utilisez 2 à 16 caractères (sans espaces).");
          setStep('numero_vol');
          break;
        }
        addPilote(numero);
        setCtx(prev => ({ ...prev, numero_vol: numero }));
        await addBria(`Indicatif ${numero}, bien reçu.`);
        if (ctx.type_vol === 'IFR') {
          setStep('resume');
          await showResume();
        } else {
          await addBria("Quelle est votre route ?");
          setStep('quoi_ciel');
        }
        break;
      }

      case 'quoi_ciel': {
        addPilote(v);
        setCtx(prev => ({ ...prev, quoi_ciel: v.trim() }));
        await addBria(`${v.trim()}, bien reçu.`);
        setStep('resume');
        await showResume();
        break;
      }

      default:
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ctx, isTyping, lookupLoading, addBria, addPilote, lookupAircraft, handleClose]);

  // ─── Show summary ───
  const showResume = useCallback(async () => {
    const lines: string[] = [];
    lines.push(`Récapitulatif de votre ${ctx.mode === 'intention' ? 'intention de vol' : 'plan de vol'} :`);
    lines.push(`Appareil : ${ctx.aircraft?.type_avion_nom || ''} ${ctx.immatriculation}`);
    lines.push(`Régime : ${ctx.type_vol}`);
    lines.push(`De ${getAeroportNom(ctx.aeroport_depart)} vers ${getAeroportNom(ctx.aeroport_arrivee)}`);
    lines.push(`Temps prévu : ${ctx.temps_prev_min} min`);
    if (ctx.heure_depart) lines.push(`Départ : ${ctx.heure_depart} UTC`);
    if (ctx.mode === 'plan') {
      if (ctx.vol_commercial) lines.push(`Vol commercial — ${ctx.nature_transport}`);
      if (ctx.vol_ferry) lines.push('Vol ferry');
      if (ctx.sid_depart) lines.push(`SID : ${ctx.sid_depart}`);
      if (ctx.star_arrivee) lines.push(`STAR : ${ctx.star_arrivee}`);
      if (ctx.altitude_croisiere) lines.push(`Altitude : ${ctx.altitude_croisiere}`);
      lines.push(`Indicatif : ${ctx.numero_vol}`);
    }
    if (ctx.nb_personnes) {
      lines.push(`Autonomie : ${ctx.autonomie} min — ${ctx.nb_personnes} pers. à bord`);
    } else {
      lines.push(`Autonomie : ${ctx.autonomie} min`);
    }
    if (ctx.type_vol === 'IFR') {
      lines.push(ctx.sid_depart && ctx.star_arrivee
        ? `Route : ${ctx.sid_depart} + ${ctx.star_arrivee}`
        : 'Route : RADAR VECTORS DCT');
    } else if (ctx.quoi_ciel) {
      lines.push(`Route (strip) : ${ctx.quoi_ciel}`);
    }

    let nbPax = 0;
    let cargoKg = 0;
    if (ctx.vol_commercial && ctx.aircraft?.source === 'compagnie') {
      const ac = ctx.aircraft;
      const prixBillet = ac.prix_billet_pax ?? 0;
      const prixKgCargo = ac.prix_kg_cargo ?? 0;
      const salairePct = ac.pourcentage_salaire ?? 0;
      let revenu = 0;
      if (ctx.nature_transport === 'passagers' && ac.capacite_pax > 0) {
        const coef = calculerCoefficientRemplissage(ctx.aeroport_depart, ctx.aeroport_arrivee, prixBillet);
        nbPax = Math.min(Math.floor(ac.capacite_pax * Math.min(coef, 1.0)), ac.capacite_pax);
        revenu += nbPax * prixBillet;
        if (ac.capacite_cargo_kg > 0) {
          const coefC = calculerCoefficientChargementCargo(ctx.aeroport_depart, ctx.aeroport_arrivee, prixKgCargo);
          cargoKg = Math.min(Math.floor(ac.capacite_cargo_kg * Math.min(coefC, 1.0)), ac.capacite_cargo_kg);
          revenu += cargoKg * prixKgCargo;
        }
      } else if (ctx.nature_transport === 'cargo' && ac.capacite_cargo_kg > 0) {
        const coefC = calculerCoefficientChargementCargo(ctx.aeroport_depart, ctx.aeroport_arrivee, prixKgCargo);
        cargoKg = Math.min(Math.floor(ac.capacite_cargo_kg * Math.min(coefC, 1.0)), ac.capacite_cargo_kg);
        revenu += cargoKg * prixKgCargo;
      }
      const salaire = Math.floor(revenu * (salairePct / 100));
      lines.push(`Revenu estimé : ${revenu.toLocaleString('fr-FR')} F$ — Salaire : ${salaire.toLocaleString('fr-FR')} F$`);
    }

    // Texte lu par le BRIA : résumé court type "C'est copié pour un vol avec F-NUUU de Mellor à Greater Rockford..."
    const dep = getAeroportNom(ctx.aeroport_depart);
    const arr = getAeroportNom(ctx.aeroport_arrivee);
    let speakText: string;
    if (ctx.mode === 'intention') {
      const pers = ctx.nb_personnes ? ` avec ${ctx.nb_personnes} personne${parseInt(ctx.nb_personnes) > 1 ? 's' : ''} à bord` : '';
      speakText = `C'est copié pour une intention de vol avec ${ctx.immatriculation} de ${dep} à ${arr}${pers}.`;
    } else if (ctx.vol_ferry) {
      speakText = `C'est copié pour un vol ferry avec ${ctx.immatriculation} de ${dep} à ${arr}.`;
    } else if (ctx.vol_commercial) {
      speakText = `C'est copié pour un vol avec ${ctx.immatriculation} de ${dep} à ${arr}, un vol commercial avec ${nbPax} passager${nbPax > 1 ? 's' : ''} et ${cargoKg} kg de cargo.`;
    } else {
      speakText = `C'est copié pour un vol avec ${ctx.immatriculation} de ${dep} à ${arr}.`;
    }
    await addBria(lines.join('\n'), 600, speakText);
    await addBria("Souhaitez-vous déposer ce plan ?");
    setStep('resume');
  }, [ctx, addBria]);

  // ─── Submit flight plan ───
  const submitPlan = useCallback(async () => {
    lastActivityRef.current = Date.now();
    setStep('submitting');
    addPilote('Affirm, déposer le plan.');

    const conversationLog: BriaMessage[] = [
      ...messages,
      { role: 'pilote', text: 'Affirm, déposer le plan.' },
    ];

    // Build extra notes for non-mappable fields (format lisible, une info par ligne)
    const extraNotes: string[] = [];
    if (ctx.heure_depart) {
      const h = ctx.heure_depart.replace(/(\d{1,2})h(\d{1,2})/i, (_, a, b) => `${a.padStart(2, '0')}:${b.padStart(2, '0')}`);
      extraNotes.push(`Heure départ : ${h} UTC`);
    }
    if (ctx.autonomie) extraNotes.push(`Autonomie : ${ctx.autonomie} min`);
    if (ctx.nb_personnes) extraNotes.push(`Personnes à bord : ${ctx.nb_personnes}`);
    if (ctx.altitude_croisiere) {
      const raw = String(ctx.altitude_croisiere).trim();
      const alt = /^FL\s*/i.test(raw) ? `FL ${raw.replace(/^FL\s*/i, '').trim()}` : `FL ${raw}`;
      extraNotes.push(`Altitude croisière : ${alt}`);
    }

    const sep = '\n';
    const intentionsVol = ctx.type_vol === 'VFR'
      ? `[BRIA]\n${extraNotes.join(sep)}`
      : undefined;
    const noteAtc = extraNotes.length > 0 ? `[BRIA]\n${extraNotes.join(sep)}` : undefined;

    const numero = ctx.mode === 'intention'
      ? ctx.immatriculation
      : ctx.numero_vol || ctx.immatriculation;

    const payload: Record<string, unknown> = {
      aeroport_depart: ctx.aeroport_depart,
      aeroport_arrivee: ctx.aeroport_arrivee,
      numero_vol: numero,
      temps_prev_min: parseInt(ctx.temps_prev_min) || 30,
      type_vol: ctx.type_vol,
      bria_conversation: conversationLog,
    };

    if (ctx.type_vol === 'VFR') {
      payload.intentions_vol = intentionsVol || `Vol ${ctx.type_vol} via BRIA`;
    }
    if (ctx.type_vol === 'IFR') {
      payload.sid_depart = ctx.sid_depart || 'BRIA';
      payload.star_arrivee = ctx.star_arrivee || 'BRIA';
      if (ctx.altitude_croisiere) {
        const raw = String(ctx.altitude_croisiere).trim().replace(/^FL\s*/i, '');
        if (raw) payload.niveau_croisiere = raw;
      }
      if (ctx.aircraft?.source === 'compagnie') {
        payload.note_atc = noteAtc;
      }
    }
    if (ctx.type_vol === 'VFR' && ctx.aircraft?.source === 'compagnie') {
      payload.note_atc = noteAtc;
    }

    // strip_route : IFR = route depuis SID+STAR (si les deux renseignés), sinon RADAR VECTORS DCT
    if (ctx.type_vol === 'IFR') {
      if (ctx.sid_depart?.trim() && ctx.star_arrivee?.trim() && ctx.aeroport_depart && ctx.aeroport_arrivee) {
        try {
          const [sidRes, starRes] = await Promise.all([
            fetch(`/api/sid-star?aeroport=${encodeURIComponent(ctx.aeroport_depart)}&type=SID`),
            fetch(`/api/sid-star?aeroport=${encodeURIComponent(ctx.aeroport_arrivee)}&type=STAR`),
          ]);
          const sidList = await sidRes.json();
          const starList = await starRes.json();
          const sidProc = Array.isArray(sidList) && sidList.find((s: { nom: string }) => String(s.nom).toUpperCase() === String(ctx.sid_depart).toUpperCase());
          const starProc = Array.isArray(starList) && starList.find((s: { nom: string }) => String(s.nom).toUpperCase() === String(ctx.star_arrivee).toUpperCase());
          if (sidProc?.route && starProc?.route) {
            payload.strip_route = joinSidStarRoute(sidProc.route, starProc.route);
          } else {
            payload.strip_route = 'RADAR VECTORS DCT';
          }
        } catch {
          // En cas d'erreur API, on n'a pas les routes réelles (seulement les noms) → fallback sécurisé
          payload.strip_route = 'RADAR VECTORS DCT';
        }
      } else {
        payload.strip_route = 'RADAR VECTORS DCT';
      }
    }
    if (!payload.strip_route && ctx.quoi_ciel?.trim()) {
      payload.strip_route = ctx.quoi_ciel.trim();
    }

    if (ctx.aircraft?.source === 'compagnie') {
      payload.compagnie_avion_id = ctx.aircraft.compagnie_avion_id;
      payload.compagnie_id = ctx.aircraft.compagnie_id;
      payload.vol_commercial = ctx.vol_commercial;
      payload.vol_ferry = ctx.vol_ferry;
      if (ctx.vol_commercial) {
        payload.nature_transport = ctx.nature_transport;
      }
    } else if (ctx.aircraft?.source === 'personnel') {
      payload.inventaire_avion_id = ctx.aircraft.inventaire_avion_id;
    }

    // Non-IFR VFR note
    if (ctx.type_vol === 'VFR' && !payload.note_atc && extraNotes.length > 0) {
      payload.note_atc = noteAtc;
    }

    try {
      const res = await fetch('/api/plans-vol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok && data.error?.includes('Aucune fréquence ATC')) {
        payload.vol_sans_atc = true;
        const res2 = await fetch('/api/plans-vol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data2 = await res2.json().catch(() => ({}));
        if (!res2.ok) throw new Error(data2.error || 'Erreur');
        await addBria("Aucun ATC disponible. Votre plan a été accepté en autosurveillance. Bon vol !");
      } else if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      } else if (data.statut === 'en_attente') {
        const ac = data.atc_contact as { nom: string; position: string; frequence: string } | undefined;
        let msg = "Votre plan de vol a été déposé. Il est en attente de validation par l'ATC.";
        if (ac?.nom && ac?.position) {
          msg += ac.frequence
            ? ` Contactez ${ac.nom} ${ac.position} sur ${ac.frequence}. Bon vol !`
            : ` Contactez ${ac.nom} ${ac.position}. Bon vol !`;
        } else {
          msg += " Bon vol !";
        }
        await addBria(msg);
      } else {
        await addBria("Votre plan de vol a été déposé avec succès. Bon vol !");
      }
      setStep('done');
      router.push('/logbook/plans-vol');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      await addBria(`Erreur lors du dépôt : ${msg}`);
      setStep('error');
    }
  }, [ctx, messages, addBria, addPilote, router]);

  // ─── Render input zone based on step ───
  const fmsBtn = 'px-4 py-2.5 rounded font-mono text-sm font-bold tracking-wide border transition-all duration-150';
  const fmsBtnGreen = `${fmsBtn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15 hover:border-emerald-400/60 hover:shadow-[0_0_12px_rgba(16,185,129,0.15)]`;
  const fmsBtnCyan = `${fmsBtn} border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(6,182,212,0.15)]`;
  const fmsBtnRed = `${fmsBtn} border-red-500/40 text-red-300 hover:bg-red-500/15 hover:border-red-400/60`;
  const fmsInput = 'w-full bg-black/60 border border-emerald-500/20 text-emerald-100 rounded px-4 py-2.5 text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:shadow-[0_0_8px_rgba(16,185,129,0.1)]';

  const renderInput = () => {
    if (isTyping || step === 'submitting' || step === 'done') return null;

    switch (step) {
      case 'choice':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('intention')} className={`flex-1 ${fmsBtnCyan}`}>
              INTENTION
            </button>
            <button type="button" onClick={() => handleAnswer('plan')} className={`flex-1 ${fmsBtnGreen}`}>
              PLAN DE VOL
            </button>
          </div>
        );

      case 'confirm_aircraft':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('oui')} className={`flex-1 ${fmsBtnGreen}`}>AFFIRM</button>
            <button type="button" onClick={() => handleAnswer('non')} className={`flex-1 ${fmsBtnRed}`}>NEGATIF</button>
          </div>
        );

      case 'regime_vol':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('VFR')} className={`flex-1 ${fmsBtnCyan}`}>VFR</button>
            <button type="button" onClick={() => handleAnswer('IFR')} className={`flex-1 ${fmsBtnGreen}`}>IFR</button>
          </div>
        );

      case 'vol_prive_confirm':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('affirm')} className={`flex-1 ${fmsBtnGreen}`}>AFFIRM</button>
            <button type="button" onClick={() => handleAnswer('negatif')} className={`flex-1 ${fmsBtnRed}`}>NEGATIF</button>
          </div>
        );

      case 'vol_type':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('commercial')} className={`flex-1 ${fmsBtnGreen}`}>COMMERCIAL</button>
            <button type="button" onClick={() => handleAnswer('ferry')} className={`flex-1 ${fmsBtnCyan}`}>FERRY</button>
          </div>
        );

      case 'nature_transport':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('passagers')} className={`flex-1 ${fmsBtnCyan}`}>PASSAGERS</button>
            <button type="button" onClick={() => handleAnswer('cargo')} className={`flex-1 ${fmsBtnGreen}`}>CARGO</button>
          </div>
        );

      case 'aeroport_depart':
      case 'aeroport_arrivee':
        return (
          <select
            className={`${fmsInput} cursor-pointer`}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); if (e.target.value) handleAnswer(e.target.value); }}
          >
            <option value="">-- SELECT AERODROME --</option>
            {AEROPORTS_PTFS.map(a => (
              <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>
            ))}
          </select>
        );

      case 'sid':
      case 'star': {
        const isSid = step === 'sid';
        const aeroport = isSid ? ctx.aeroport_depart : ctx.aeroport_arrivee;
        const type = isSid ? 'SID' : 'STAR';
        const togglePanel = async () => {
          if (showSidStarPanel) { setShowSidStarPanel(false); return; }
          if (!aeroport) return;
          setSidStarLoading(true);
          setShowSidStarPanel(true);
          try {
            const res = await fetch(`/api/sid-star?aeroport=${encodeURIComponent(aeroport)}&type=${type}`);
            const data = await res.json();
            setSidStarList(Array.isArray(data) ? data : []);
          } catch { setSidStarList([]); } finally { setSidStarLoading(false); }
        };
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button type="button" onClick={togglePanel} disabled={!aeroport || sidStarLoading}
                className={`flex items-center justify-center w-11 h-11 shrink-0 rounded ${fmsBtn} border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-30`}
                title={isSid ? 'Voir les SID disponibles' : 'Voir les STAR disponibles'}>
                <svg viewBox="0 0 24 12" className="w-5 h-4 fill-current" aria-hidden><path d="M0 0 L24 0 L12 12 Z" /></svg>
              </button>
              <form onSubmit={(e) => { e.preventDefault(); handleAnswer(inputValue); }} className="flex-1 flex gap-2">
                <input ref={inputRef} type="text" autoComplete="off" value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); lastActivityRef.current = Date.now(); }}
                  placeholder={getPlaceholder(step)} disabled={lookupLoading}
                  className={fmsInput} autoFocus={!isIOS()} />
                <button type="submit" disabled={!inputValue.trim() || lookupLoading}
                  className="px-3 py-2.5 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-30 transition-colors font-mono">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
            {showSidStarPanel && (
              <div className="max-h-48 overflow-y-auto rounded border border-emerald-500/20 bg-black/80 p-1.5 space-y-0.5">
                {sidStarLoading ? (
                  <p className="text-slate-500 text-xs font-mono py-4 text-center">LOADING...</p>
                ) : sidStarList.length === 0 ? (
                  <p className="text-slate-500 text-xs font-mono py-2 px-2">NO {type} AVAILABLE</p>
                ) : (
                  sidStarList.map((proc) => (
                    <button key={proc.id} type="button"
                      onClick={() => { handleAnswer(proc.nom); setShowSidStarPanel(false); }}
                      className="w-full text-left px-3 py-1.5 rounded text-xs font-mono text-emerald-300/80 hover:bg-emerald-500/15 hover:text-emerald-200 transition-colors">
                      {proc.nom}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      }

      case 'resume':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={submitPlan} className={`flex-1 ${fmsBtnGreen}`}>AFFIRM / DEPOSER</button>
            <button type="button" onClick={handleClose} className={`flex-1 ${fmsBtnRed}`}>ANNULER</button>
          </div>
        );

      case 'error':
        return (
          <button type="button" onClick={handleClose} className={`w-full ${fmsBtnRed}`}>FERMER</button>
        );

      default:
        return (
          <form onSubmit={(e) => { e.preventDefault(); handleAnswer(inputValue); }} className="flex gap-2">
            <input ref={inputRef} type="text"
              inputMode={step === 'nb_personnes' || step === 'temps_vol' || step === 'autonomie' ? 'numeric' : 'text'}
              autoComplete="off" value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); lastActivityRef.current = Date.now(); }}
              placeholder={getPlaceholder(step)} disabled={lookupLoading}
              className={fmsInput} autoFocus={!isIOS()} />
            <button type="submit" disabled={!inputValue.trim() || lookupLoading}
              className="px-3 py-2.5 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-30 transition-colors font-mono">
              <Send className="h-4 w-4" />
            </button>
          </form>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center" style={{ zIndex: 99999 }}>
      <div
        className="bg-[#0a0f1a] border border-emerald-500/20 rounded-lg shadow-[0_0_40px_rgba(16,185,129,0.06)] w-full max-w-2xl flex flex-col overflow-hidden"
        style={isIOS() ? { height: '85dvh', maxHeight: '85dvh' } : { height: '85vh' }}
      >
        {/* Header */}
        <div className="bg-slate-950 border-b border-emerald-500/15 px-5 py-3.5 shrink-0 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                <Radio className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-mono font-bold text-emerald-300 tracking-widest">BRIA // FPL SERVICE</h2>
                <p className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                  {step === 'done' ? (
                    <><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />COMM TERMINATED</>
                  ) : step === 'submitting' ? (
                    <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />PROCESSING...</>
                  ) : (
                    <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />ON AIR</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={toggleTts}
                className={`p-2 rounded border transition-colors ${ttsEnabled ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-slate-700 text-slate-600 hover:bg-slate-800'}`}
                title={ttsEnabled ? 'Couper la voix' : 'Activer la voix'}>
                {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={handleClose} disabled={step === 'submitting' || step === 'done'}
                className="flex items-center gap-1.5 px-3 py-2 rounded border border-red-500/30 text-red-400 text-xs font-mono tracking-wide hover:bg-red-500/10 transition-colors disabled:opacity-30"
                title="Raccrocher">
                <PhoneOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">END</span>
              </button>
            </div>
          </div>
          {step !== 'greeting' && step !== 'done' && step !== 'error' && (
            <div className="flex gap-0.5">
              {(['choice', 'immat', 'regime_vol', 'heure_depart', 'aeroport_depart', 'aeroport_arrivee', 'temps_vol', 'autonomie', 'vol_type', 'altitude', 'resume'] as StepId[]).map((s, i) => {
                const allSteps: StepId[] = ['choice', 'immat', 'confirm_aircraft', 'regime_vol', 'heure_depart', 'confirm_heure', 'aeroport_depart', 'confirm_dep', 'aeroport_arrivee', 'confirm_arr', 'temps_vol', 'confirm_temps', 'autonomie', 'confirm_autonomie', 'vol_type', 'vol_prive_confirm', 'nature_transport', 'confirm_vol_type', 'nb_personnes', 'confirm_personnes', 'sid', 'confirm_sid', 'star', 'confirm_star', 'altitude', 'confirm_altitude', 'numero_vol', 'confirm_numero', 'quoi_ciel', 'resume', 'submitting'];
                const currentIndex = allSteps.indexOf(step);
                const stepIndex = allSteps.indexOf(s);
                const reached = stepIndex <= currentIndex;
                return <div key={i} className={`h-0.5 flex-1 transition-all duration-300 ${reached ? 'bg-emerald-400' : 'bg-slate-800'}`} />;
              })}
            </div>
          )}
        </div>

        {(step === 'submitting' || step === 'done') && (
          <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/20">
            <p className="text-xs font-mono text-amber-400/80 text-center tracking-wide">
              STANDBY — DO NOT CLOSE
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#060a12]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'bria' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded px-3.5 py-2 text-sm whitespace-pre-line font-mono leading-relaxed ${
                msg.role === 'bria'
                  ? 'bg-emerald-950/50 border border-emerald-500/15 text-emerald-100/90'
                  : 'bg-cyan-950/50 border border-cyan-500/15 text-cyan-100/90'
              }`}>
                <span className={`text-[10px] font-bold tracking-[0.2em] block mb-1 ${
                  msg.role === 'bria' ? 'text-emerald-500/70' : 'text-cyan-500/70'
                }`}>
                  {msg.role === 'bria' ? 'BRIA' : 'PLT'}
                </span>
                {msg.text}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-emerald-950/50 border border-emerald-500/15 rounded px-3.5 py-2">
                <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-500/70 block mb-1.5 font-mono">BRIA</span>
                <div className="flex items-center gap-0.5">
                  <span className="w-1.5 h-4 bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-500/50 ml-1">TRANSMITTING</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input zone */}
        <div className="border-t border-emerald-500/10 px-4 py-3 bg-slate-950/80 shrink-0">
          {renderInput()}
        </div>
      </div>
    </div>,
    document.body
  );
}

function getPlaceholder(step: StepId): string {
  switch (step) {
    case 'immat': return 'Ex: F-ABCD';
    case 'heure_depart': return 'Ex: 14h30';
    case 'temps_vol': return 'Ex: 45';
    case 'autonomie': return 'Ex: 120';
    case 'nb_personnes': return 'Ex: 2';
    case 'sid': return 'Ex: DEPARTUR1A';
    case 'star': return 'Ex: ARRIVA2B';
    case 'altitude': return 'Ex: FL350 ou 3500ft';
    case 'numero_vol': return 'Ex: AFR1234';
    case 'quoi_ciel': return 'Ex: DCT PUNTO DCT MARUK, ou transit TFFJ–TNCM...';
    default: return '';
  }
}
