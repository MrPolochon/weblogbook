/**
 * Module TTS partagé pour BRIA, Téléphone ATC et SIAVI.
 * Sélectionne automatiquement la meilleure voix française disponible
 * et expose une API simple pour parler / annuler.
 */

import { sanitizeForSpeech } from '@/lib/utils';

const SPEECH_TIMEOUT_MS = 14_000;

const PREFERRED_VOICES = [
  'Google français',
  'Microsoft Paul - French (France)',
  'Microsoft Hortense - French (France)',
  'Thomas',
  'Amelie',
];

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceResolved = false;

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (voiceResolved) return cachedVoice;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  for (const name of PREFERRED_VOICES) {
    const match = voices.find(v => v.name === name);
    if (match) { cachedVoice = match; voiceResolved = true; return match; }
  }

  const frVoice = voices.find(v => v.lang.startsWith('fr'));
  if (frVoice) { cachedVoice = frVoice; voiceResolved = true; return frVoice; }

  voiceResolved = true;
  return null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voiceResolved = false;
    pickFrenchVoice();
  });
  pickFrenchVoice();
}

export interface TtsOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  timeoutMs?: number;
}

const DEFAULTS: Required<TtsOptions> = {
  rate: 0.92,
  pitch: 1.0,
  volume: 0.85,
  timeoutMs: SPEECH_TIMEOUT_MS,
};

/** Remplace F$ par Félitz Dollards pour une lecture naturelle */
export function textePourTTS(text: string): string {
  return text
    .replace(/F\$\/kg/g, 'Félitz Dollards par kilogramme')
    .replace(/F\$/g, 'Félitz Dollards');
}

/** Parle un texte et retourne une Promise qui se résout quand c'est fini. */
export function speakAndWait(text: string, opts?: TtsOptions): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();

  const o = { ...DEFAULTS, ...opts };
  const toSpeak = sanitizeForSpeech(textePourTTS(text));

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      speechSynthesis.cancel();
      resolve();
    };
    const timer = setTimeout(finish, o.timeoutMs);

    const u = new SpeechSynthesisUtterance(toSpeak);
    u.lang = 'fr-FR';
    u.rate = o.rate;
    u.pitch = o.pitch;
    u.volume = o.volume;

    const voice = pickFrenchVoice();
    if (voice) u.voice = voice;

    u.onend = finish;
    u.onerror = finish;

    try {
      speechSynthesis.speak(u);
    } catch {
      finish();
    }
  });
}

/** Parle un texte sans attendre (fire-and-forget), utile pour les messages courts (téléphone ATC). */
export function speakNow(text: string, opts?: TtsOptions): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();

  const o = { ...DEFAULTS, ...opts };
  const toSpeak = sanitizeForSpeech(text);

  const u = new SpeechSynthesisUtterance(toSpeak);
  u.lang = 'fr-FR';
  u.rate = o.rate;
  u.pitch = o.pitch;
  u.volume = o.volume;

  const voice = pickFrenchVoice();
  if (voice) u.voice = voice;

  try {
    speechSynthesis.speak(u);
  } catch { /* silently ignore */ }
}

/** Annule toute synthèse en cours. */
export function cancelSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
}

/** Retourne le nom de la voix actuellement sélectionnée (debug). */
export function getSelectedVoiceName(): string | null {
  return pickFrenchVoice()?.name ?? null;
}
