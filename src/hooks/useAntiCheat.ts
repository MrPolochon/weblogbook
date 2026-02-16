'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AntiCheatOptions {
  enabled?: boolean;
  onCheatDetected?: () => void;
  /** Délai en ms avant d'activer la détection (défaut: 3000) */
  graceMs?: number;
}

/* ── Mots-clés d'extensions IA connues ── */
const AI_KEYWORDS = [
  'blackbox', 'chatgpt', 'copilot', 'github-copilot', 'gh-copilot',
  'codeium', 'tabnine', 'phind', 'cody', 'sourcegraph',
  'gemini', 'bard', 'claude', 'anthropic', 'openai',
  'gpt', 'ai-assist', 'aiassist', 'ai_assist',
  'grammarly', 'quillbot',
  'kagi', 'perplexity', 'you-ai',
  'cursor', 'continue-dev', 'supermaven',
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
 * Scan profond du DOM entier à la recherche d'éléments d'extension.
 * Cherche shadow roots, iframes injectées, et éléments suspects.
 */
function deepScanDOM(): boolean {
  // Chercher toutes les iframes dans le document
  const iframes = document.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const src = iframe.src?.toLowerCase() || '';
    const id = iframe.id?.toLowerCase() || '';
    const cls = iframe.className?.toString().toLowerCase() || '';
    // Iframe d'extension (pas de src = inline, ou src chrome-extension://)
    if (src.startsWith('chrome-extension://') || src.startsWith('moz-extension://')) return true;
    for (const kw of AI_KEYWORDS) {
      if (src.includes(kw) || id.includes(kw) || cls.includes(kw)) return true;
    }
  }

  // Chercher des shadow roots dans le DOM
  const allElements = document.querySelectorAll('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    // Shadow DOM ouvert = extension injectant un overlay
    if (el.shadowRoot) {
      // Vérifier si c'est un shadow root de notre app (peu probable)
      const tag = el.tagName?.toLowerCase() || '';
      // Les éléments standard de notre app n'utilisent pas de shadow DOM
      if (tag !== 'style' && tag !== 'link') return true;
    }
  }

  // Chercher des éléments positionnés en fixed/absolute qui couvrent un large espace
  // et qui ne sont pas dans notre arbre React (enfants directs de body ou html)
  const bodyChildren = document.body.children;
  for (let i = 0; i < bodyChildren.length; i++) {
    const child = bodyChildren[i] as HTMLElement;
    const tag = child.tagName?.toLowerCase() || '';
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'noscript') continue;
    // Notre app est dans un div#__next ou similaire
    if (child.id === '__next' || child.id === 'root' || child.id === '__nuxt') continue;
    // Vérifier si c'est un gros élément overlay
    if (isExtensionElement(child)) return true;
    const style = window.getComputedStyle(child);
    if (style.position === 'fixed' || style.position === 'absolute') {
      const rect = child.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) return true;
    }
  }

  return false;
}

export function useAntiCheat({ enabled = true, onCheatDetected, graceMs = 3000 }: AntiCheatOptions = {}) {
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

    // Période de grâce
    activeRef.current = false;
    const graceTimeout = setTimeout(() => {
      activeRef.current = true;
    }, graceMs);

    // ── 1. Détection changement d'onglet ──
    const handleVisibilityChange = () => {
      if (document.hidden) triggerCheat();
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

      // Ctrl+Enter / Shift+Enter (souvent utilisé par les extensions IA pour soumettre)
      // On ne bloque pas Enter simple (nécessaire pour le formulaire)
      // Mais on bloque Ctrl+Enter et Alt+Enter
      if ((e.ctrlKey || e.altKey) && e.key === 'Enter') {
        e.preventDefault(); return;
      }

      // Bloquer copier/coller/sélectionner tout
      if (e.ctrlKey && ['c', 'C', 'v', 'V', 'a', 'A'].includes(e.key)) {
        e.preventDefault(); return;
      }

      // Bloquer Alt+Tab détection via Alt seul (ne peut pas bloquer Alt+Tab OS)
      // Mais peut bloquer Alt+raccourci d'extension
      if (e.altKey && e.key !== 'Alt') {
        e.preventDefault(); return;
      }
    };

    // ── 4. Bloquer clic droit ──
    const handleContextMenu = (e: Event) => { e.preventDefault(); };

    // ── 5. Bloquer copier/coller ──
    const handlePaste = (e: Event) => { e.preventDefault(); };
    const handleCopy = (e: Event) => { e.preventDefault(); };

    // ── 6. Détection focus sur élément d'extension ──
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (target && isExtensionElement(target)) triggerCheat();
    };

    // ── 7. Scan DOM profond périodique ──
    // Toutes les 2 secondes, scanner le DOM à la recherche d'éléments suspects
    const deepScanInterval = setInterval(() => {
      if (cheatingRef.current || !activeRef.current) return;
      if (deepScanDOM()) triggerCheat();
    }, 2000);

    // ── 8. Surveillance du focus actif ──
    const focusCheckInterval = setInterval(() => {
      if (cheatingRef.current || !activeRef.current) return;
      const active = document.activeElement;
      if (active && isExtensionElement(active)) triggerCheat();
    }, 1000);

    // ── 9. MutationObserver sur tout le subtree ──
    const observer = new MutationObserver((mutations) => {
      if (cheatingRef.current || !activeRef.current) return;
      for (const mutation of mutations) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          const tag = el.tagName?.toLowerCase();

          // Ignorer scripts, styles, meta inoffensifs
          if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'noscript') continue;

          // Iframe injectée = extension
          if (tag === 'iframe') {
            triggerCheat();
            return;
          }

          // Shadow DOM sur un élément ajouté
          if (el.shadowRoot) {
            triggerCheat();
            return;
          }

          // Élément d'extension détecté
          if (isExtensionElement(el)) {
            triggerCheat();
            return;
          }

          // Gros élément ajouté au body (overlay d'extension)
          if (el.parentElement === document.body) {
            const elId = el.id?.toLowerCase() || '';
            if (elId === '__next' || elId === 'root') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width > 150 && rect.height > 150) {
              triggerCheat();
              return;
            }
          }

          // Vérifier les sous-éléments ajoutés (extensions qui insèrent un conteneur avec des enfants)
          const subSuspect = el.querySelectorAll('iframe, [class*="copilot"], [class*="blackbox"], [class*="chatgpt"], [class*="codeium"], [id*="copilot"], [id*="blackbox"], [id*="chatgpt"]');
          if (subSuspect.length > 0) {
            triggerCheat();
            return;
          }
        }

        // Vérifier les modifications d'attributs (extension qui modifie un élément existant)
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          if (isExtensionElement(target)) {
            triggerCheat();
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style', 'data-copilot', 'data-blackbox', 'data-ai'],
    });

    // ── 10. Détecter window.blur (perte de focus de la fenêtre) ──
    // Copilot/extensions peuvent ouvrir des popups ou prendre le focus
    let blurCount = 0;
    const handleWindowBlur = () => {
      if (!activeRef.current || cheatingRef.current) return;
      blurCount++;
      // Tolérance : 1 blur peut arriver accidentellement
      // Au 2ème blur suspect, on déclenche
      if (blurCount >= 2) triggerCheat();
    };

    // Reset blur count quand la fenêtre reprend le focus
    const handleWindowFocus = () => {
      // Ne reset pas immédiatement pour garder le compteur entre les blurs rapides
      setTimeout(() => { if (!cheatingRef.current) blurCount = Math.max(0, blurCount - 1); }, 5000);
    };

    // Enregistrer les listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

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
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(deepScanInterval);
      clearInterval(focusCheckInterval);
      observer.disconnect();
    };
  }, [enabled, triggerCheat, graceMs]);

  return { cheatingDetected };
}
