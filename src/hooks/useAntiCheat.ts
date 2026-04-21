'use client';

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 * useAntiCheat — anti-triche pragmatique
 * ────────────────────────────────────────────────────────────────────────────
 * Philosophie : être JUSTE, pas PARANOÏAQUE.
 *  - Tolère les comportements humains normaux (notif système, raccourci OS,
 *    clic légèrement à côté du formulaire, micro-changement d'onglet).
 *  - Avertit AVANT de pénaliser pour les actions ambiguës (F12, clic outside) :
 *    1ʳᵉ tentative ⇒ toast d'alerte + action bloquée
 *    2ᵉ tentative   ⇒ triche
 *  - Ne pénalise INSTANTANÉMENT que les signaux non ambigus :
 *    iframe d'extension, iframe cross-origin, focus perdu trop longtemps,
 *    onglet caché trop longtemps, présence non confirmée.
 *  - Le bouton "Je suis toujours là" ne s'affiche QUE si l'utilisateur n'a pas
 *    interagi récemment ⇒ pas d'interruption pendant qu'on tape.
 *
 * Aucun scan DOM par mots-clés (source #1 historique de faux positifs).
 * ──────────────────────────────────────────────────────────────────────────── */

export type CheatReason =
  | 'devtools_shortcut'
  | 'view_source_shortcut'
  | 'iframe_extension'
  | 'iframe_other_origin'
  | 'focus_in_extension_iframe'
  | 'click_outside_test_area'
  | 'focus_lost_too_long'
  | 'tab_hidden_too_long'
  | 'presence_check_timeout';

interface AntiCheatOptions {
  enabled?: boolean;
  /** Triche confirmée : la session est terminée. */
  onCheatDetected?: (reason: CheatReason) => void;
  /**
   * Avertissement non bloquant : action ambiguë détectée mais pas pénalisante.
   * À afficher comme un toast (3-5 s). Si l'utilisateur recommence, ce sera
   * compté comme triche.
   */
  onWarning?: (message: string) => void;
  /** Délai d'amorçage avant d'activer la surveillance (ms). */
  graceMs?: number;
  /** Conteneur du test : tout clic en dehors (hors zone tampon) est suspect. */
  allowedInteractionRootRef?: RefObject<HTMLElement | null>;
  /** Logs en console + champ `lastReason` exposé. */
  debug?: boolean;
}

/* ── Tunables (tous calibrés "humain" — voir commentaires) ────────────────── */

/** Scan iframes : 2.5 s suffit, les overlays d'extension sont persistants. */
const STRUCTURAL_SCAN_INTERVAL_MS = 2500;

/** Tick de vérification focus / visibilité. */
const FOCUS_CHECK_INTERVAL_MS = 1000;

/**
 * Perte de focus tolérée : 10 s.
 * Couvre largement notification Discord/Outlook, raccourci OS rapide,
 * clavier virtuel mobile, gestionnaire de mots de passe natif.
 */
const FOCUS_LOST_TICK_THRESHOLD = 10;

/**
 * Onglet masqué toléré : 8 s.
 * Couvre un Alt+Tab pour vérifier l'heure, une notification système, un
 * passage rapide sur une autre fenêtre par réflexe.
 */
const TAB_HIDDEN_TICK_THRESHOLD = 8;

/** Plage entre deux invitations de présence : aléatoire 60-120 s. */
const PRESENCE_CHECK_MIN_MS = 60_000;
const PRESENCE_CHECK_MAX_MS = 120_000;

/** Délai pour cliquer "Je suis là" : 25 s (était 15, trop court). */
const PRESENCE_RESPONSE_DEADLINE_MS = 25_000;

/**
 * Si l'utilisateur a interagi (clavier / souris / input) dans les 30 s qui
 * précèdent une invitation de présence, on saute carrément l'invitation :
 * il est manifestement actif, pas besoin de l'interrompre.
 */
const PRESENCE_SKIP_IF_ACTIVE_MS = 30_000;

/**
 * Marge en pixels autour du conteneur : un clic à <40 px du bord est
 * considéré comme légitime (l'utilisateur a juste "loupé" la zone).
 */
const CLICK_OUTSIDE_TOLERANCE_PX = 40;

/* ── Helpers structurels ──────────────────────────────────────────────────── */

const EXTENSION_PROTOCOLS = new Set([
  'chrome-extension:',
  'moz-extension:',
  'safari-extension:',
  'safari-web-extension:',
  'edge-extension:',
  'ms-browser-extension:',
]);

function findSuspectIframe(): { reason: CheatReason } | null {
  const origin = window.location.origin;
  const iframes = document.getElementsByTagName('iframe');

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const src = iframe.src;
    if (!src) continue;

    let parsed: URL | null = null;
    try {
      parsed = new URL(src, window.location.href);
    } catch {
      continue;
    }

    if (EXTENSION_PROTOCOLS.has(parsed.protocol)) {
      return { reason: 'iframe_extension' };
    }
    if (parsed.protocol === 'about:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:') {
      continue;
    }
    if (parsed.origin && parsed.origin !== 'null' && parsed.origin !== origin) {
      return { reason: 'iframe_other_origin' };
    }
  }
  return null;
}

function activeElementIsInExtensionIframe(): boolean {
  const active = document.activeElement;
  if (!active || active.tagName?.toLowerCase() !== 'iframe') return false;
  const src = (active as HTMLIFrameElement).src;
  if (!src) return false;
  try {
    const u = new URL(src, window.location.href);
    return EXTENSION_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

function pointerEventIsInsideAllowedRoot(e: PointerEvent, root: HTMLElement): boolean {
  const target = e.target as Element | null;

  if (target === document.documentElement || target === document.body) return true;

  if (target instanceof HTMLOptionElement || target instanceof HTMLSelectElement) {
    return root.contains(target);
  }

  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  if (path.length === 0) {
    return target ? root.contains(target) : true;
  }

  for (let i = 0; i < path.length; i++) {
    const n = path[i];
    if (n === root) return true;
    if (n instanceof Node && root.contains(n)) return true;
  }
  return false;
}

/**
 * Vrai si le clic est dans une zone tampon de `CLICK_OUTSIDE_TOLERANCE_PX`
 * autour du conteneur. Évite les faux positifs sur les bords (l'utilisateur
 * vise la marge ou clique sur l'arrière-plan immédiatement à côté).
 */
function pointerIsNearRoot(e: PointerEvent, root: HTMLElement): boolean {
  const rect = root.getBoundingClientRect();
  const tol = CLICK_OUTSIDE_TOLERANCE_PX;
  return (
    e.clientX >= rect.left - tol &&
    e.clientX <= rect.right + tol &&
    e.clientY >= rect.top - tol &&
    e.clientY <= rect.bottom + tol
  );
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useAntiCheat({
  enabled = true,
  onCheatDetected,
  onWarning,
  graceMs = 3000,
  allowedInteractionRootRef,
  debug = false,
}: AntiCheatOptions = {}) {
  const [cheatingDetected, setCheatingDetected] = useState(false);
  const [presencePromptVisible, setPresencePromptVisible] = useState(false);
  const [lastReason, setLastReason] = useState<CheatReason | null>(null);

  /** Refs stables : le useEffect ne se remonte JAMAIS sur un changement de callback. */
  const onCheatRef = useRef(onCheatDetected);
  const onWarningRef = useRef(onWarning);
  const debugRef = useRef(debug);
  const rootRef = useRef<RefObject<HTMLElement | null> | undefined>(allowedInteractionRootRef);

  useEffect(() => { onCheatRef.current = onCheatDetected; }, [onCheatDetected]);
  useEffect(() => { onWarningRef.current = onWarning; }, [onWarning]);
  useEffect(() => { debugRef.current = debug; }, [debug]);
  useEffect(() => { rootRef.current = allowedInteractionRootRef; }, [allowedInteractionRootRef]);

  const stateRef = useRef({
    cheating: false,
    active: false,
    /** Un signal de focus utilisateur a-t-il déjà eu lieu ? Évite faux positif onglet ouvert en arrière-plan. */
    hadFocus: false,
    focusLostTicks: 0,
    tabHiddenTicks: 0,
    /** Compteurs d'infractions ambiguës (1ʳᵉ = warning, 2ᵉ = triche). */
    strikes: { devtools: 0, viewSource: 0, clickOutside: 0 },
    /** Timestamp de la dernière interaction utilisateur (ms). */
    lastActivityAt: 0,
  });

  const presenceCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceResponseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNextPresenceRef = useRef<(() => void) | null>(null);

  const triggerCheat = useCallback((reason: CheatReason) => {
    const s = stateRef.current;
    if (s.cheating || !s.active) return;
    s.cheating = true;

    if (debugRef.current) {
      console.warn(`[AntiCheat] Triche : ${reason} | strikes:`, { ...s.strikes });
    }

    if (presenceCheckTimeoutRef.current) {
      clearTimeout(presenceCheckTimeoutRef.current);
      presenceCheckTimeoutRef.current = null;
    }
    if (presenceResponseTimeoutRef.current) {
      clearTimeout(presenceResponseTimeoutRef.current);
      presenceResponseTimeoutRef.current = null;
    }

    setLastReason(reason);
    setPresencePromptVisible(false);
    setCheatingDetected(true);
    onCheatRef.current?.(reason);
  }, []);

  const warn = useCallback((message: string) => {
    if (debugRef.current) console.info(`[AntiCheat] Warning : ${message}`);
    onWarningRef.current?.(message);
  }, []);

  const confirmPresence = useCallback(() => {
    setPresencePromptVisible(false);
    if (presenceResponseTimeoutRef.current) {
      clearTimeout(presenceResponseTimeoutRef.current);
      presenceResponseTimeoutRef.current = null;
    }
    if (debugRef.current) console.info('[AntiCheat] Présence confirmée');
    stateRef.current.lastActivityAt = Date.now();
    scheduleNextPresenceRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const state = stateRef.current;
    state.cheating = false;
    state.active = false;
    state.hadFocus = false;
    state.focusLostTicks = 0;
    state.tabHiddenTicks = 0;
    state.strikes = { devtools: 0, viewSource: 0, clickOutside: 0 };
    state.lastActivityAt = Date.now();
    setCheatingDetected(false);
    setPresencePromptVisible(false);
    setLastReason(null);

    /* ── 1. Période de grâce ───────────────────────────────────────────── */
    const graceTimeout = setTimeout(() => {
      state.active = true;
      if (debugRef.current) console.info('[AntiCheat] Surveillance active');
      scheduleNextPresenceRef.current?.();
    }, graceMs);

    /* ── 2. Présence intelligente ──────────────────────────────────────── */
    const scheduleNextPresenceCheck = () => {
      if (state.cheating || !state.active) return;
      if (presenceCheckTimeoutRef.current) {
        clearTimeout(presenceCheckTimeoutRef.current);
      }
      const delay =
        PRESENCE_CHECK_MIN_MS +
        Math.random() * (PRESENCE_CHECK_MAX_MS - PRESENCE_CHECK_MIN_MS);

      presenceCheckTimeoutRef.current = setTimeout(() => {
        presenceCheckTimeoutRef.current = null;
        if (state.cheating || !state.active) return;

        const sinceActivity = Date.now() - state.lastActivityAt;
        if (sinceActivity < PRESENCE_SKIP_IF_ACTIVE_MS) {
          if (debugRef.current) {
            console.info(`[AntiCheat] Présence skip — actif il y a ${Math.round(sinceActivity / 1000)}s`);
          }
          scheduleNextPresenceCheck();
          return;
        }

        if (debugRef.current) console.info('[AntiCheat] Demande de présence');
        setPresencePromptVisible(true);

        presenceResponseTimeoutRef.current = setTimeout(() => {
          presenceResponseTimeoutRef.current = null;
          if (state.cheating) return;
          triggerCheat('presence_check_timeout');
        }, PRESENCE_RESPONSE_DEADLINE_MS);
      }, delay);
    };
    scheduleNextPresenceRef.current = scheduleNextPresenceCheck;

    /* ── 3. Tracking de l'activité utilisateur (pour la présence) ─────── */
    const trackActivity = () => { state.lastActivityAt = Date.now(); };
    window.addEventListener('mousemove', trackActivity, { passive: true });
    document.addEventListener('input', trackActivity, { passive: true });
    document.addEventListener('scroll', trackActivity, { passive: true, capture: true });
    document.addEventListener('touchstart', trackActivity, { passive: true });

    /* ── 4. Raccourcis bloqués (warning d'abord, triche au 2ᵉ essai) ──── */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.cheating || !state.active) return;
      state.lastActivityAt = Date.now();

      const isF12 = e.key === 'F12';
      const isDevtools =
        isF12 ||
        (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key));
      const isViewSource = (e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U');

      if (isDevtools) {
        e.preventDefault();
        state.strikes.devtools += 1;
        if (state.strikes.devtools >= 2) {
          triggerCheat('devtools_shortcut');
        } else {
          warn('Outils de développement bloqués. La prochaine tentative sera comptée comme triche.');
        }
        return;
      }
      if (isViewSource) {
        e.preventDefault();
        state.strikes.viewSource += 1;
        if (state.strikes.viewSource >= 2) {
          triggerCheat('view_source_shortcut');
        } else {
          warn('Affichage du code source bloqué. La prochaine tentative sera comptée comme triche.');
        }
      }
    };

    /* ── 5. Scan structurel iframes (signaux non ambigus → triche directe) */
    const structuralInterval = setInterval(() => {
      if (state.cheating || !state.active) return;

      const iframeIssue = findSuspectIframe();
      if (iframeIssue) {
        triggerCheat(iframeIssue.reason);
        return;
      }
      if (activeElementIsInExtensionIframe()) {
        triggerCheat('focus_in_extension_iframe');
      }
    }, STRUCTURAL_SCAN_INTERVAL_MS);

    /* ── 6. Pointer en dehors de la zone (warning d'abord) ────────────── */
    const handlePointerDownCapture = (e: PointerEvent) => {
      if (state.cheating || !state.active) return;
      const root = rootRef.current?.current;
      if (!root) return;
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      state.lastActivityAt = Date.now();

      if (pointerEventIsInsideAllowedRoot(e, root)) return;
      if (pointerIsNearRoot(e, root)) return;

      state.strikes.clickOutside += 1;
      if (state.strikes.clickOutside >= 2) {
        triggerCheat('click_outside_test_area');
      } else {
        warn('Clic en dehors du formulaire détecté. Restez bien dans la zone du test.');
      }
    };

    /* ── 7. Focus / visibilité avec marge confortable ─────────────────── */
    const handleWindowFocus = () => {
      state.hadFocus = true;
      state.focusLostTicks = 0;
      state.tabHiddenTicks = 0;
      state.lastActivityAt = Date.now();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        state.tabHiddenTicks = 0;
        state.lastActivityAt = Date.now();
      }
    };

    const focusInterval = setInterval(() => {
      if (state.cheating || !state.active) return;
      if (!state.hadFocus) return;

      if (document.hidden) {
        state.tabHiddenTicks += 1;
        if (state.tabHiddenTicks >= TAB_HIDDEN_TICK_THRESHOLD) {
          triggerCheat('tab_hidden_too_long');
          return;
        }
      } else {
        state.tabHiddenTicks = 0;
      }

      if (typeof document.hasFocus === 'function') {
        if (document.hasFocus()) {
          state.focusLostTicks = 0;
        } else {
          state.focusLostTicks += 1;
          if (state.focusLostTicks >= FOCUS_LOST_TICK_THRESHOLD) {
            triggerCheat('focus_lost_too_long');
          }
        }
      }
    }, FOCUS_CHECK_INTERVAL_MS);

    /* ── Enregistrement listeners ─────────────────────────────────────── */
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDownCapture, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearTimeout(graceTimeout);
      if (presenceCheckTimeoutRef.current) {
        clearTimeout(presenceCheckTimeoutRef.current);
        presenceCheckTimeoutRef.current = null;
      }
      if (presenceResponseTimeoutRef.current) {
        clearTimeout(presenceResponseTimeoutRef.current);
        presenceResponseTimeoutRef.current = null;
      }
      clearInterval(structuralInterval);
      clearInterval(focusInterval);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDownCapture, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('mousemove', trackActivity);
      document.removeEventListener('input', trackActivity);
      document.removeEventListener('scroll', trackActivity, true);
      document.removeEventListener('touchstart', trackActivity);
      scheduleNextPresenceRef.current = null;
    };
  }, [enabled, graceMs, triggerCheat, warn]);

  return {
    cheatingDetected,
    presencePromptVisible,
    confirmPresence,
    /** Raison de la dernière détection (utile pour debug / messages). */
    lastReason,
  };
}
