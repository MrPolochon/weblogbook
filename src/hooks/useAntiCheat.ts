'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AntiCheatOptions {
  enabled?: boolean;
  onCheatDetected?: () => void;
}

// Vérifie si un élément appartient à notre app Next.js
function isAppElement(el: Element | null): boolean {
  if (!el) return false;
  // L'app Next.js vit dans #__next ou dans le body directement
  const appRoot = document.getElementById('__next') || document.querySelector('[data-nextjs-scroll-focus-boundary]');
  if (appRoot && appRoot.contains(el)) return true;
  // Éléments standards du navigateur (html, body, head)
  if (el === document.body || el === document.documentElement || el === document.head) return true;
  return false;
}

export function useAntiCheat({ enabled = true, onCheatDetected }: AntiCheatOptions = {}) {
  const [cheatingDetected, setCheatingDetected] = useState(false);
  const cheatingRef = useRef(false);

  const triggerCheat = useCallback(() => {
    if (cheatingRef.current) return; // Déjà déclenché
    cheatingRef.current = true;
    setCheatingDetected(true);
    onCheatDetected?.();
  }, [onCheatDetected]);

  useEffect(() => {
    if (!enabled || cheatingRef.current) return;

    // ── 1. Détection changement d'onglet / application ──
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheat();
      }
    };

    // ── 2. Détection perte de focus fenêtre ──
    const handleBlur = () => {
      triggerCheat();
    };

    // ── 3. Empêcher de quitter la page ──
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // ── 4. Bloquer raccourcis clavier ──
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        triggerCheat();
        return;
      }
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
        triggerCheat();
        return;
      }
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        triggerCheat();
        return;
      }
      if (e.ctrlKey && ['c', 'C', 'v', 'V', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    };

    // ── 5. Bloquer clic droit ──
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    // ── 6. Bloquer copier/coller ──
    const handlePaste = (e: Event) => {
      e.preventDefault();
    };
    const handleCopy = (e: Event) => {
      e.preventDefault();
    };

    // ── 7. Détection extensions IA / overlays injectés ──
    // Quand le focus va vers un élément qui n'est PAS dans notre app
    // (= l'utilisateur clique/tape dans un popup d'extension)
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (target && !isAppElement(target)) {
        triggerCheat();
      }
    };

    // Surveillance périodique : si activeElement est hors de l'app
    // (certaines extensions capturent le focus sans déclencher focusin)
    const focusCheckInterval = setInterval(() => {
      if (cheatingRef.current) return;
      const active = document.activeElement;
      if (active && active !== document.body && !isAppElement(active)) {
        triggerCheat();
      }
    }, 1000);

    // MutationObserver : détecter les gros overlays injectés par des extensions
    // (quand un élément visible > 200x200 est ajouté au body, hors de l'app)
    const observer = new MutationObserver((mutations) => {
      if (cheatingRef.current) return;
      for (const mutation of mutations) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          // Ignorer les éléments de notre app
          if (isAppElement(el)) continue;
          // Ignorer les scripts et styles (inoffensifs visuellement)
          const tag = el.tagName?.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') continue;
          // Vérifier si l'élément est visible et assez grand (overlay d'extension)
          const rect = el.getBoundingClientRect();
          if (rect.width > 150 && rect.height > 150) {
            triggerCheat();
            return;
          }
          // Vérifier les iframes injectées (souvent utilisées par les extensions)
          if (tag === 'iframe') {
            triggerCheat();
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: false });

    // Enregistrer tous les listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('focusin', handleFocusIn);
      clearInterval(focusCheckInterval);
      observer.disconnect();
    };
  }, [enabled, triggerCheat]);

  return { cheatingDetected };
}
