'use client';

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';

interface AntiCheatOptions {
  enabled?: boolean;
  onCheatDetected?: () => void;
  /**
   * Délai avant d’activer la détection (ms). Sert surtout d’amortisseur au montage (hydratation, injections DOM).
   * En mode relaxé sans `allowedInteractionRootRef`, un plancher de 15 s est appliqué (comportement historique).
   * Avec une zone de clic fournie, seule cette valeur est utilisée — une courte grâce (0–3000 ms) suffit en général.
   */
  graceMs?: number;
  /**
   * Mode relaxé : copier-coller et clic droit autorisés ; détection renforcée quand même :
   * iframe autre domaine, extensions IA, présence à intervalles aléatoires avec délai de réponse court.
   * Si `allowedInteractionRootRef` est fourni : la perte de focus / onglet masqué ne déclenche plus (évite les faux positifs) ;
   * en revanche tout pointerdown en dehors de ce conteneur (overlay extension, autre couche DOM) déclenche la triche.
   * Limite : consultation sur un 2ᵉ écran sans cliquer hors page reste indétectable côté navigateur.
   */
  relaxed?: boolean;
  /**
   * Conteneur du questionnaire : clics / touches à l’intérieur = légitimes ; en dehors = triche (extensions, calques, etc.).
   * À lier sur un élément qui englobe chrono, formulaire et bouton de présence.
   */
  allowedInteractionRootRef?: RefObject<HTMLElement | null>;
}

/* ── Mots-clés d'extensions IA connues (ne pas inclure "cursor" = faux positifs avec l’IDE / nom d’app) ── */
const AI_KEYWORDS = [
  'blackbox', 'chatgpt', 'copilot', 'github-copilot', 'gh-copilot',
  'codeium', 'tabnine', 'phind', 'cody', 'sourcegraph',
  'gemini', 'bard', 'claude', 'anthropic', 'openai',
  'gpt', 'ai-assist', 'aiassist', 'ai_assist',
  'grammarly', 'quillbot',
  'kagi', 'perplexity', 'you-ai',
  'continue-dev', 'supermaven',
];

/** Attributs data-* souvent injectés par les extensions */
const SUSPECT_DATA_ATTRS = [
  'data-grammarly', 'data-copilot', 'data-codeium',
  'data-blackbox', 'data-chatgpt', 'data-ai',
];

/**
 * Vérifie si un élément est injecté par une extension IA.
 * Remonte le DOM en cherchant des indices d'injection :
 * shadow DOM, iframes, attributs/classes/ids d'extension.
 */
function isExtensionElement(el: Element | null): boolean {
  if (!el) return false;

  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    // Shadow DOM host = probablement une extension
    if (current.shadowRoot) return true;

    const tag = current.tagName?.toLowerCase() || '';

    // Iframe injectée
    if (tag === 'iframe') return true;

    // Vérifier id et classes
    const id = current.id?.toLowerCase() || '';
    const cls = current.className?.toString().toLowerCase() || '';
    const src = (current as HTMLIFrameElement).src?.toLowerCase() || '';

    for (const kw of AI_KEYWORDS) {
      if (id.includes(kw) || cls.includes(kw) || src.includes(kw)) return true;
    }

    // Attributs data-* suspects
    for (const attr of SUSPECT_DATA_ATTRS) {
      if (current.hasAttribute(attr)) return true;
    }

    // Attributs personnalisés suspects (data-* avec des noms d'IA)
    if (current.attributes) {
      for (let i = 0; i < current.attributes.length; i++) {
        const attrName = current.attributes[i].name.toLowerCase();
        if (attrName.startsWith('data-')) {
          for (const kw of AI_KEYWORDS) {
            if (attrName.includes(kw)) return true;
          }
        }
      }
    }

    current = current.parentElement;
  }

  return false;
}

/**
 * Détecte extensions IA / overlay (Copilot, chat GPT, Grammarly, etc.) :
 * iframes d’extension ou avec mots-clés IA, shadow roots, éléments avec id/class/data-* IA.
 * @param skipBigOverlay si true, ne déclenche pas sur un simple gros élément fixed (évite faux positifs modales du site).
 */
function hasAIOverlayOrExtension(skipBigOverlay = false): boolean {
  const iframes = document.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const src = (iframe.src || '').toLowerCase();
    const id = (iframe.id || '').toLowerCase();
    const cls = (iframe.className?.toString() || '').toLowerCase();
    if (src.startsWith('chrome-extension://') || src.startsWith('moz-extension://')) return true;
    for (const kw of AI_KEYWORDS) {
      if (src.includes(kw) || id.includes(kw) || cls.includes(kw)) return true;
    }
  }

  const allElements = document.querySelectorAll('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    if (el.shadowRoot) {
      const tag = el.tagName?.toLowerCase() || '';
      if (tag !== 'style' && tag !== 'link') return true;
    }
  }

  const bodyChildren = document.body.children;
  for (let i = 0; i < bodyChildren.length; i++) {
    const child = bodyChildren[i] as HTMLElement;
    const tag = child.tagName?.toLowerCase() || '';
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'noscript') continue;
    if (child.id === '__next' || child.id === 'root' || child.id === '__nuxt') continue;
    if (isExtensionElement(child)) return true;
    if (!skipBigOverlay) {
      const style = window.getComputedStyle(child);
      if (style.position === 'fixed' || style.position === 'absolute') {
        const rect = child.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) return true;
      }
    }
  }

  return false;
}

/** Scan DOM complet (mode strict). */
function deepScanDOM(): boolean {
  return hasAIOverlayOrExtension(false);
}

/** Retourne true si une iframe charge une URL d’un autre domaine (hors extensions navigateur). */
function hasIframeOtherOrigin(): boolean {
  try {
    const origin = window.location.origin;
    const iframes = document.querySelectorAll('iframe[src]');
    for (let i = 0; i < iframes.length; i++) {
      const src = (iframes[i] as HTMLIFrameElement).src;
      if (!src) continue;
      try {
        const u = new URL(src);
        if (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') continue;
        if (u.origin !== origin) return true;
      } catch {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/** True si le pointer event vise le contenu du test (y compris shadow DOM) ; false = clic « ailleurs » (extension, autre calque). */
function pointerEventIsInsideAllowedRoot(e: PointerEvent, root: HTMLElement): boolean {
  // Barre de défilement du document : la cible est souvent <html>, hors du div du formulaire
  if (e.target === document.documentElement) return true;

  const path = e.composedPath();
  for (let i = 0; i < path.length; i++) {
    const n = path[i];
    if (n === root) return true;
    if (n instanceof Node && root.contains(n)) return true;
  }
  return false;
}

/** Présence (mode relaxé) : intervalle aléatoire entre min et max pour éviter un rythme prévisible. */
const PRESENCE_CHECK_MIN_MS = 12000;
const PRESENCE_CHECK_MAX_MS = 28000;
/** Temps pour cliquer « Je suis là » — trop long = marge pour consulter une IA entre deux clics. */
const PRESENCE_RESPONSE_DEADLINE_MS = 10000;

/** Mode relaxé : ticks sans focus fenêtre avant triche (~8 × 1,2 s ≈ 9,6 s ; laisse passer une notif courte). */
const RELAXED_NO_FOCUS_THRESHOLD = 8;
/** Mode relaxé : ticks avec onglet masqué avant triche (autre onglet / autre appli en avant-plan sur la même fenêtre). */
const RELAXED_HIDDEN_STREAK_THRESHOLD = 7;
const RELAXED_FOCUS_CHECK_MS = 1200;

export function useAntiCheat({
  enabled = true,
  onCheatDetected,
  graceMs = 3000,
  relaxed = false,
  allowedInteractionRootRef,
}: AntiCheatOptions = {}) {
  const [cheatingDetected, setCheatingDetected] = useState(false);
  const [presencePromptVisible, setPresencePromptVisible] = useState(false);
  const cheatingRef = useRef(false);
  const activeRef = useRef(false);
  const presenceCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceResponseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ne déclencher "perte de focus = triche" que si l'utilisateur a déjà interagi avec la page (évite faux positifs onglet ouvert en arrière-plan). */
  const userHadFocusRef = useRef(false);
  /** Nombre de vérifications consécutives sans focus avant de déclencher (évite faux positifs : notification, menu navigateur, etc.). */
  const noFocusCountRef = useRef(0);
  /** Suite de ticks où l’onglet du test est masqué (mode relaxé uniquement). */
  const hiddenStreakRef = useRef(0);
  const NO_FOCUS_THRESHOLD = 4;
  const FOCUS_CHECK_INTERVAL_MS = 1500;

  const triggerCheat = useCallback(() => {
    if (cheatingRef.current) return;
    if (!activeRef.current) return;
    cheatingRef.current = true;
    setPresencePromptVisible(false);
    setCheatingDetected(true);
    onCheatDetected?.();
  }, [onCheatDetected]);

  const scheduleNextRef = useRef<(() => void) | null>(null);
  const confirmPresence = useCallback(() => {
    setPresencePromptVisible(false);
    if (presenceResponseTimeoutRef.current) {
      clearTimeout(presenceResponseTimeoutRef.current);
      presenceResponseTimeoutRef.current = null;
    }
    scheduleNextRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled || cheatingRef.current) return;

    const useClickContainment = Boolean(allowedInteractionRootRef);
    const effectiveGrace =
      relaxed && !useClickContainment
        ? Math.max(graceMs, 15000)
        : graceMs;
    activeRef.current = false;
    userHadFocusRef.current = false;
    noFocusCountRef.current = 0;
    hiddenStreakRef.current = 0;
    setPresencePromptVisible(false);
    const graceTimeout = setTimeout(() => {
      activeRef.current = true;
    }, effectiveGrace);

    // ── Mode relaxé : notification de présence à intervalle aléatoire ──
    const scheduleNextPresenceCheck = () => {
      if (cheatingRef.current || !activeRef.current) return;
      if (presenceCheckTimeoutRef.current) clearTimeout(presenceCheckTimeoutRef.current);
      const delay =
        PRESENCE_CHECK_MIN_MS + Math.random() * (PRESENCE_CHECK_MAX_MS - PRESENCE_CHECK_MIN_MS);
      presenceCheckTimeoutRef.current = setTimeout(() => {
        if (cheatingRef.current || !activeRef.current) return;
        presenceCheckTimeoutRef.current = null;
        setPresencePromptVisible(true);
        presenceResponseTimeoutRef.current = setTimeout(() => {
          if (cheatingRef.current) return;
          presenceResponseTimeoutRef.current = null;
          triggerCheat();
        }, PRESENCE_RESPONSE_DEADLINE_MS);
      }, delay);
    };
    scheduleNextRef.current = scheduleNextPresenceCheck;
    const presenceGraceTimeout = relaxed ? setTimeout(scheduleNextPresenceCheck, effectiveGrace) : null;

    // ── 1. Changement d’onglet ──
    // En mode relaxé : seuil cumulatif via hiddenStreakRef (voir intervalle focus) pour laisser un bref changement d’onglet.
    // En mode strict : tout changement d’onglet = triche immédiate.
    const handleVisibilityChange = () => {
      if (document.hidden && !relaxed) triggerCheat();
    };

    // ── 2. Empêcher de quitter la page ──
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // ── 3. Bloquer raccourcis clavier (y compris ceux de Copilot/IA) ──
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 (DevTools)
      if (e.key === 'F12') { e.preventDefault(); triggerCheat(); return; }

      // Ctrl+Shift+I/J/C (DevTools)
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault(); triggerCheat(); return;
      }

      // Ctrl+U (source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault(); triggerCheat(); return;
      }

      // En mode relaxé, ne pas bloquer Ctrl+C/V/A (remplir le formulaire)
      if (!relaxed) {
        // Ctrl+Shift+Space / Ctrl+Space (Copilot/autocomplete trigger)
        if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
          e.preventDefault(); return;
        }
        // Alt+\ ou Ctrl+\ (Copilot suggest)
        if ((e.altKey || e.ctrlKey) && e.key === '\\') {
          e.preventDefault(); return;
        }
        // Ctrl+Shift+A (extensions panel dans Chrome)
        if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
          e.preventDefault(); return;
        }
        // Ctrl+Enter / Alt+Enter
        if ((e.ctrlKey || e.altKey) && e.key === 'Enter') {
          e.preventDefault(); return;
        }
        // Bloquer copier/coller/sélectionner tout
        if (e.ctrlKey && ['c', 'C', 'v', 'V', 'a', 'A'].includes(e.key)) {
          e.preventDefault(); return;
        }
        if (e.altKey && e.key !== 'Alt') {
          e.preventDefault(); return;
        }
      }
    };

    // ── 4. Bloquer clic droit (en mode strict uniquement, pour permettre copier-coller en relaxé) ──
    const handleContextMenu = (e: Event) => { if (!relaxed) e.preventDefault(); };

    // ── 5. Bloquer copier/coller (en mode strict uniquement) ──
    const handlePaste = (e: Event) => { if (!relaxed) e.preventDefault(); };
    const handleCopy = (e: Event) => { if (!relaxed) e.preventDefault(); };

    // ── 6. Détection focus sur élément d'extension ──
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (target && isExtensionElement(target)) triggerCheat();
    };

    // ── 7. Scan DOM : iframe autre domaine + extensions IA (Copilot, chat IA, etc.) ──
    // Mode relaxé : autre domaine OU overlay IA (Copilot, ChatGPT, Grammarly…) = triche ; pas de réaction au changement d’onglet.
    // Mode strict : idem + tout gros élément fixed (overlay générique).
    const deepScanInterval = relaxed
      ? setInterval(() => {
          if (cheatingRef.current || !activeRef.current) return;
          if (hasIframeOtherOrigin()) triggerCheat();
          if (hasAIOverlayOrExtension(true)) triggerCheat();
        }, 2500)
      : setInterval(() => {
          if (cheatingRef.current || !activeRef.current) return;
          if (deepScanDOM()) triggerCheat();
        }, 2000);

    // ── 8. Surveillance du focus actif (élément = extension) ; en relaxé aussi pour overlay injecté dans la page
    const focusCheckInterval = setInterval(() => {
      if (cheatingRef.current || !activeRef.current) return;
      const active = document.activeElement;
      if (active && isExtensionElement(active)) triggerCheat();
    }, 1000);

    // ── 9. MutationObserver : détection immédiate d’injection d’IA (Copilot, chat, etc.) ──
    // En mode relaxé : on réagit uniquement aux iframes, shadowRoot et éléments/classe/id IA (pas au “gros bloc” pour éviter faux positifs).
    const observer = new MutationObserver((mutations) => {
      if (cheatingRef.current || !activeRef.current) return;
      for (const mutation of mutations) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          const tag = el.tagName?.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'noscript') continue;

          if (tag === 'iframe') { triggerCheat(); return; }
          if (el.shadowRoot) { triggerCheat(); return; }
          if (isExtensionElement(el)) { triggerCheat(); return; }
          const subSuspect = el.querySelectorAll('iframe, [class*="copilot"], [class*="blackbox"], [class*="chatgpt"], [class*="codeium"], [id*="copilot"], [id*="blackbox"], [id*="chatgpt"]');
          if (subSuspect.length > 0) { triggerCheat(); return; }
          if (!relaxed && el.parentElement === document.body) {
            const elId = el.id?.toLowerCase() || '';
            if (elId !== '__next' && elId !== 'root') {
              const rect = el.getBoundingClientRect();
              if (rect.width > 150 && rect.height > 150) { triggerCheat(); return; }
            }
          }
        }
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          if (isExtensionElement(target)) { triggerCheat(); return; }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style', 'data-copilot', 'data-blackbox', 'data-ai'],
    });

    // ── 10. Clic / toucher hors du conteneur du test (extensions, iframes overlay, etc.) ──
    const handlePointerDownCapture = (e: PointerEvent) => {
      if (!useClickContainment || !activeRef.current || cheatingRef.current) return;
      const root = allowedInteractionRootRef?.current;
      if (!root) return;
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      if (!pointerEventIsInsideAllowedRoot(e, root)) triggerCheat();
    };
    if (useClickContainment) {
      document.addEventListener('pointerdown', handlePointerDownCapture, true);
    }

    // ── 11. Perte de focus fenêtre / onglet masqué (désactivé en relaxé si zone de clic fournie) ──
    const handleWindowFocus = () => {
      userHadFocusRef.current = true;
      noFocusCountRef.current = 0;
      if (relaxed) hiddenStreakRef.current = 0;
    };
    const handleWindowBlur = () => { /* seuil via intervalle */ };

    const skipRelaxedWindowFocus =
      relaxed && useClickContainment;

    // Strict : N ticks sans document.hasFocus. Relaxé sans conteneur : seuil onglet masqué + perte de focus.
    const focusCheckWindowInterval =
      skipRelaxedWindowFocus
        ? null
        : setInterval(() => {
            if (cheatingRef.current || !activeRef.current) return;
            if (!userHadFocusRef.current) return;

            if (relaxed) {
              if (document.hidden) {
                hiddenStreakRef.current += 1;
                if (hiddenStreakRef.current >= RELAXED_HIDDEN_STREAK_THRESHOLD) triggerCheat();
              } else {
                hiddenStreakRef.current = 0;
              }
              if (typeof document.hasFocus !== 'function') return;
              if (document.hasFocus()) {
                noFocusCountRef.current = 0;
                return;
              }
              noFocusCountRef.current += 1;
              if (noFocusCountRef.current >= RELAXED_NO_FOCUS_THRESHOLD) triggerCheat();
              return;
            }

            if (typeof document.hasFocus !== 'function') return;
            if (document.hasFocus()) {
              noFocusCountRef.current = 0;
              return;
            }
            noFocusCountRef.current += 1;
            if (noFocusCountRef.current >= NO_FOCUS_THRESHOLD) triggerCheat();
          }, relaxed ? RELAXED_FOCUS_CHECK_MS : FOCUS_CHECK_INTERVAL_MS);

    // Enregistrer les listeners
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      clearTimeout(graceTimeout);
      if (presenceGraceTimeout != null) clearTimeout(presenceGraceTimeout);
      if (presenceCheckTimeoutRef.current) {
        clearTimeout(presenceCheckTimeoutRef.current);
        presenceCheckTimeoutRef.current = null;
      }
      if (presenceResponseTimeoutRef.current) {
        clearTimeout(presenceResponseTimeoutRef.current);
        presenceResponseTimeoutRef.current = null;
      }
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('blur', handleWindowBlur);
      if (useClickContainment) {
        document.removeEventListener('pointerdown', handlePointerDownCapture, true);
      }
      if (deepScanInterval) clearInterval(deepScanInterval);
      if (focusCheckInterval) clearInterval(focusCheckInterval);
      if (focusCheckWindowInterval) clearInterval(focusCheckWindowInterval);
      observer.disconnect();
    };
  }, [enabled, triggerCheat, graceMs, relaxed, allowedInteractionRootRef]);

  return { cheatingDetected, presencePromptVisible: relaxed ? presencePromptVisible : false, confirmPresence: relaxed ? confirmPresence : undefined };
}
