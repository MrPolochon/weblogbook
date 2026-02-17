'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AntiCheatOptions {
  enabled?: boolean;
  onCheatDetected?: () => void;
  /** Délai en ms avant d'activer la détection (défaut: 3000) */
  graceMs?: number;
  /** Mode relaxé : pas de réaction au changement d’onglet, pas de blocage copier-coller ; on détecte quand même iframe autre domaine + extensions IA (Copilot, chat, etc.) */
  relaxed?: boolean;
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

export function useAntiCheat({ enabled = true, onCheatDetected, graceMs = 3000, relaxed = false }: AntiCheatOptions = {}) {
  const [cheatingDetected, setCheatingDetected] = useState(false);
  const cheatingRef = useRef(false);
  const activeRef = useRef(false);

  const triggerCheat = useCallback(() => {
    if (cheatingRef.current) return;
    if (!activeRef.current) return;
    cheatingRef.current = true;
    setCheatingDetected(true);
    onCheatDetected?.();
  }, [onCheatDetected]);

  useEffect(() => {
    if (!enabled || cheatingRef.current) return;

    const effectiveGrace = relaxed ? Math.max(graceMs, 8000) : graceMs;
    activeRef.current = false;
    const graceTimeout = setTimeout(() => {
      activeRef.current = true;
    }, effectiveGrace);

    // ── 1. Changement d’onglet ──
    // En mode relaxé : on ne fait rien (on ne peut pas savoir si l’autre onglet est du même domaine).
    // En mode strict : tout changement d’onglet = triche.
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
          if (hasIframeOtherOrigin() || hasAIOverlayOrExtension(true)) triggerCheat();
        }, 2500)
      : setInterval(() => {
          if (cheatingRef.current || !activeRef.current) return;
          if (deepScanDOM()) triggerCheat();
        }, 2000);

    // ── 8. Surveillance du focus actif (désactivé en mode relaxé) ──
    const focusCheckInterval = relaxed ? null : setInterval(() => {
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

    // ── 10. Clic ailleurs / changement d’application = triche ──
    const handleWindowBlur = () => {
      if (!activeRef.current || cheatingRef.current) return;
      triggerCheat();
    };

    // Vérification périodique du focus : le blur n’est pas toujours envoyé quand on passe à une autre app (Alt+Tab, autre fenêtre)
    const focusCheckWindowInterval = setInterval(() => {
      if (cheatingRef.current || !activeRef.current) return;
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
        triggerCheat();
      }
    }, 800);

    // Enregistrer les listeners
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('blur', handleWindowBlur);
      if (deepScanInterval) clearInterval(deepScanInterval);
      if (focusCheckInterval) clearInterval(focusCheckInterval);
      clearInterval(focusCheckWindowInterval);
      observer.disconnect();
    };
  }, [enabled, triggerCheat, graceMs, relaxed]);

  return { cheatingDetected };
}
