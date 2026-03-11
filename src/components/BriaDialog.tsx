'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Phone, PhoneOff, Radio, Send } from 'lucide-react';
import { toast } from 'sonner';
import { AEROPORTS_PTFS, calculerCoefficientRemplissage, calculerCoefficientChargementCargo, genererTypeCargaison, genererTypeCargaisonComplementaire, getCargaisonInfo, getMarchandiseRareAleatoire } from '@/lib/aeroports-ptfs';

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
  | 'vol_type' | 'nature_transport' | 'confirm_vol_type'
  | 'sid' | 'confirm_sid' | 'star' | 'confirm_star'
  | 'altitude' | 'confirm_altitude'
  | 'numero_vol' | 'confirm_numero'
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
}

const INITIAL_STATE: BriaState = {
  mode: null, immatriculation: '', aircraft: null,
  type_vol: 'VFR', heure_depart: '', aeroport_depart: '', aeroport_arrivee: '',
  temps_prev_min: '', autonomie: '', nb_personnes: '',
  vol_commercial: false, vol_ferry: false, nature_transport: 'passagers',
  sid_depart: '', star_arrivee: '', altitude_croisiere: '', numero_vol: '',
};

// ─── TTS helper ───

function speakAndWait(text: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.9;
    u.volume = 0.8;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

function getAeroportNom(code: string) {
  return AEROPORTS_PTFS.find(a => a.code === code)?.nom || code;
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasGreeted = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const relaunchAtRef = useRef<number | null>(null);
  const wrongAirportCountRef = useRef(0);
  const wrongHeureCountRef = useRef(0);
  const relaunchCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Add BRIA message with typing delay + TTS (attend la fin de la lecture pour enchaîner)
  // Si speakText est fourni, le BRIA lit ça au lieu du texte affiché
  const addBria = useCallback((text: string, delay = 600, speakText?: string) => {
    setIsTyping(true);
    const toSpeak = speakText ?? text;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'bria', text }]);
        scrollToBottom();
        speakAndWait(toSpeak).finally(() => {
          setIsTyping(false);
          resolve();
        });
      }, delay);
    });
  }, [scrollToBottom]);

  const addPilote = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: 'pilote', text }]);
    scrollToBottom();
  }, [scrollToBottom]);

  // Vérifier cooldown au montage (sécurité si ouverture directe)
  useEffect(() => {
    const remaining = getBriaCooldownRemaining();
    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      toast.error(`Vous ne pouvez pas appeler le BRIA avant ${mins} minute${mins > 1 ? 's' : ''}.`);
      onClose();
    }
  }, [onClose]);

  // ─── Greeting on mount ───
  useEffect(() => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;
    (async () => {
      await addBria('B. R. I. A, bonjour.', 500);
      await addBria("C'est pour quoi ?", 1000);
      setStep('choice');
    })();
  }, [addBria]);

  // Focus input when step changes
  useEffect(() => {
    if (!isTyping) inputRef.current?.focus();
  }, [step, isTyping]);

  // Relances en cas d'inactivité : 30s au début, -0.5s à chaque fois jusqu'à 5s, puis raccroche
  const RELANCE_INITIALE_MS = 30 * 1000;
  const RELANCE_DECREMENT_MS = 500;
  const RELANCE_MIN_MS = 5 * 1000;
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
          speechSynthesis.cancel();
          onClose();
        } else {
          relaunchAtRef.current = now;
          relaunchCountRef.current += 1;
          setMessages(prev => [...prev, { role: 'bria', text: "Êtes-vous toujours là ?" }]);
          speakAndWait("Êtes-vous toujours là ?");
        }
      }
    }, 2000); // Vérifier toutes les 2 s
    return () => clearInterval(interval);
  }, [step, isTyping, onClose]);

  // ─── Aircraft lookup ───
  const lookupAircraft = useCallback(async (immat: string): Promise<AircraftInfo | null> => {
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/avions/lookup?immatriculation=${encodeURIComponent(immat)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        await addBria(d.error || "Je ne trouve pas cet avion. Vérifiez l'immatriculation.", 600);
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
        const regime = v.toUpperCase() as 'VFR' | 'IFR';
        addPilote(regime);
        setCtx(prev => ({ ...prev, type_vol: regime }));
        await addBria(`${regime}, bien reçu. Quelle est votre heure de départ souhaitée en UTC ?`);
        setStep('heure_depart');
        break;
      }

      case 'heure_depart': {
        const heureDansLePasse = isHeureDansLePasse(v);

        if (heureDansLePasse) {
          wrongHeureCountRef.current += 1;
          const idx = Math.min(wrongHeureCountRef.current - 1, WRONG_HEURE_MESSAGES.length - 1);
          const msg = WRONG_HEURE_MESSAGES[idx];
          addPilote(v);
          await addBria(msg);

          if (idx === WRONG_HEURE_MESSAGES.length - 1) {
            setBriaCooldown();
            speechSynthesis.cancel();
            onClose();
            return;
          }
          setStep('heure_depart');
        } else {
          const n = wrongHeureCountRef.current;
          wrongHeureCountRef.current = 0;
          addPilote(v);
          setCtx(prev => ({ ...prev, heure_depart: v }));
          if (n >= 2 && n <= 4) {
            const msg = CORRECT_HEURE_AFTER_WRONG[Math.min(n - 2, CORRECT_HEURE_AFTER_WRONG.length - 1)];
            await addBria(msg);
          }
          await addBria(`Heure de départ ${v} UTC, bien reçu.`);
          await addBria("Quel est votre aéroport de départ ?");
          setStep('aeroport_depart');
        }
        break;
      }

      case 'aeroport_depart': {
        const ac = ctx.aircraft;
        const avionPos = ac?.aeroport_actuel?.trim().toUpperCase();
        const selCode = v.trim().toUpperCase();
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
            speechSynthesis.cancel();
            onClose();
            return;
          }
          setStep('aeroport_depart');
        } else {
          const n = wrongAirportCountRef.current;
          wrongAirportCountRef.current = 0;
          addPilote(`${v} — ${getAeroportNom(v)}`);
          setCtx(prev => ({ ...prev, aeroport_depart: v }));
          if (n >= 2 && n <= 4) {
            const msg = CORRECT_AIRPORT_AFTER_WRONG[Math.min(n - 2, CORRECT_AIRPORT_AFTER_WRONG.length - 1)];
            await addBria(msg);
          }
          await addBria(`Aéroport de départ ${getAeroportNom(v)}, bien reçu.`);
          await addBria("Quel est votre aéroport de destination ?");
          setStep('aeroport_arrivee');
        }
        break;
      }

      case 'aeroport_arrivee': {
        addPilote(`${v} — ${getAeroportNom(v)}`);
        setCtx(prev => ({ ...prev, aeroport_arrivee: v }));
        await addBria(`Destination ${getAeroportNom(v)}, bien reçu.`);
        await addBria("Quel est votre temps de vol prévu en minutes ?");
        setStep('temps_vol');
        break;
      }

      case 'temps_vol': {
        addPilote(`${v} minutes`);
        setCtx(prev => ({ ...prev, temps_prev_min: v }));
        await addBria(`${v} minutes de vol prévu, bien reçu.`);
        await addBria("Quelle est votre autonomie totale en minutes ?");
        setStep('autonomie');
        break;
      }

      case 'autonomie': {
        addPilote(`${v} minutes`);
        setCtx(prev => ({ ...prev, autonomie: v }));
        await addBria(`${v} minutes d'autonomie, bien reçu.`);
        if (ctx.mode === 'intention') {
          await addBria("Combien de personnes à bord ?");
          setStep('nb_personnes');
        } else {
          await addBria("Est-ce un vol commercial, un vol ferry, ou un vol privé ?");
          setStep('vol_type');
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
        addPilote(`${v} personne${parseInt(v) > 1 ? 's' : ''}`);
        setCtx(prev => ({ ...prev, nb_personnes: v }));
        await addBria(`${v} personne${parseInt(v) > 1 ? 's' : ''} à bord, bien reçu.`);
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
        addPilote(v);
        setCtx(prev => ({ ...prev, altitude_croisiere: v }));
        await addBria(`Altitude ${v}, bien reçu.`);
        await addBria("Quel est votre numéro de vol ou indicatif d'appel ?");
        setStep('numero_vol');
        break;
      }

      case 'numero_vol': {
        addPilote(v);
        setCtx(prev => ({ ...prev, numero_vol: v.toUpperCase() }));
        await addBria(`Indicatif ${v.toUpperCase()}, bien reçu.`);
        setStep('resume');
        await showResume();
        break;
      }

      default:
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ctx, isTyping, lookupLoading, addBria, addPilote, lookupAircraft, onClose]);

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

    // Build extra notes for non-mappable fields
    const extraNotes: string[] = [];
    if (ctx.heure_depart) extraNotes.push(`Heure départ: ${ctx.heure_depart} UTC`);
    if (ctx.autonomie) extraNotes.push(`Autonomie: ${ctx.autonomie} min`);
    if (ctx.nb_personnes) extraNotes.push(`Personnes à bord: ${ctx.nb_personnes}`);
    if (ctx.altitude_croisiere) extraNotes.push(`Altitude croisière: ${ctx.altitude_croisiere}`);

    const intentionsVol = ctx.type_vol === 'VFR'
      ? `[BRIA] ${extraNotes.join(' | ')}`
      : undefined;
    const noteAtc = extraNotes.length > 0 ? `[BRIA] ${extraNotes.join(' | ')}` : undefined;

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
      if (ctx.aircraft?.source === 'compagnie') {
        payload.note_atc = noteAtc;
      }
    }
    if (ctx.type_vol === 'VFR' && ctx.aircraft?.source === 'compagnie') {
      payload.note_atc = noteAtc;
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
      } else {
        await addBria("Votre plan de vol a été déposé avec succès. Bon vol !");
      }
      setStep('done');
      setTimeout(() => {
        router.push('/logbook/plans-vol');
        router.refresh();
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      await addBria(`Erreur lors du dépôt : ${msg}`);
      setStep('error');
    }
  }, [ctx, messages, addBria, addPilote, router]);

  // ─── Render input zone based on step ───
  const renderInput = () => {
    if (isTyping || step === 'submitting' || step === 'done') return null;

    switch (step) {
      case 'choice':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('intention')}
              className="flex-1 px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors">
              Intention de vol
            </button>
            <button type="button" onClick={() => handleAnswer('plan')}
              className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors">
              Plan de vol
            </button>
          </div>
        );

      case 'confirm_aircraft':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('oui')}
              className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors">
              Affirm
            </button>
            <button type="button" onClick={() => handleAnswer('non')}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors">
              Négatif
            </button>
          </div>
        );

      case 'regime_vol':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('VFR')}
              className="flex-1 px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors">
              VFR
            </button>
            <button type="button" onClick={() => handleAnswer('IFR')}
              className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors">
              IFR
            </button>
          </div>
        );

      case 'vol_type':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('commercial')}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm transition-colors">
              Commercial
            </button>
            <button type="button" onClick={() => handleAnswer('ferry')}
              className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm transition-colors">
              Ferry
            </button>
            <button type="button" onClick={() => handleAnswer('prive')}
              className="flex-1 px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-semibold text-sm transition-colors">
              Privé
            </button>
          </div>
        );

      case 'nature_transport':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={() => handleAnswer('passagers')}
              className="flex-1 px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors">
              Passagers
            </button>
            <button type="button" onClick={() => handleAnswer('cargo')}
              className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors">
              Cargo
            </button>
          </div>
        );

      case 'aeroport_depart':
      case 'aeroport_arrivee':
        return (
          <select
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-3 text-sm font-mono font-bold"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); if (e.target.value) handleAnswer(e.target.value); }}
          >
            <option value="">— Sélectionner un aéroport —</option>
            {AEROPORTS_PTFS.map(a => (
              <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>
            ))}
          </select>
        );

      case 'resume':
        return (
          <div className="flex gap-3">
            <button type="button" onClick={submitPlan}
              className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors">
              Affirm, déposer
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors">
              Annuler
            </button>
          </div>
        );

      case 'error':
        return (
          <button type="button" onClick={onClose}
            className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors">
            Fermer
          </button>
        );

      default:
        return (
          <form onSubmit={(e) => { e.preventDefault(); handleAnswer(inputValue); }} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); lastActivityRef.current = Date.now(); }}
              placeholder={getPlaceholder(step)}
              disabled={lookupLoading}
              className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || lookupLoading}
              className="px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center" style={{ zIndex: 99999 }}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-900/80 to-amber-800/80 border-b border-amber-700/50 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-full flex items-center justify-center">
              <Radio className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-amber-100">B.R.I.A</h2>
              <p className="text-xs text-amber-300/80 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {step === 'done' ? 'Communication terminée' : 'En communication...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { speechSynthesis.cancel(); onClose(); }}
            className="flex items-center gap-2 px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors"
            title="Raccrocher"
          >
            <PhoneOff className="h-4 w-4" />
            Raccrocher
          </button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'bria' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-line ${
                msg.role === 'bria'
                  ? 'bg-amber-900/60 border border-amber-700/40 text-amber-100'
                  : 'bg-sky-700/60 border border-sky-600/40 text-sky-100'
              }`}>
                {msg.role === 'bria' && (
                  <span className="text-xs font-bold text-amber-400 block mb-1">BRIA</span>
                )}
                {msg.text}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-amber-900/60 border border-amber-700/40 rounded-xl px-4 py-2.5">
                <span className="text-xs font-bold text-amber-400 block mb-1">BRIA</span>
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input zone */}
        <div className="border-t border-slate-700 px-4 py-3 bg-slate-800/50 shrink-0">
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
    default: return '';
  }
}
