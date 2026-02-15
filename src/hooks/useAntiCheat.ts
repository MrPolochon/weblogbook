'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AntiCheatOptions {
  enabled?: boolean;
  onCheatDetected?: () => void;
  /** Délai en ms avant d'activer la détection (défaut: 3000) */
  graceMs?: number;
}

/**
 * Vérifie si un élément est injecté par une extension (et non par notre app).
 * On remonte le DOM : si on croise un shadow host, un iframe,
 * ou un élément avec des attributs d'extension connus, c'est suspect.
 * Si on arrive au body sans rien trouver de suspect, c'est ok.
 */
function isExtensionElement(el: Element | null): boolean {
  if (!el) return false;

  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    // Shadow DOM host = probablement une extension
    if (current.shadowRoot) return true;

    // Iframe injectée
    const tag = current.tagName?.toLowerCase();
    if (tag === 'iframe') return true;

    // Attributs typiques d'extensions IA
    const id = current.id?.toLowerCase() || '';
    const cls = current.className?.toString().toLowerCase() || '';
    if (
      id.includes('blackbox') || id.includes('chatgpt') || id.includes('copilot') ||
      cls.includes('blackbox') || cls.includes('chatgpt') || cls.includes('copilot') ||
      current.hasAttribute('data-grammarly') ||
      id.includes('grammarly')
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

export function useAntiCheat({ enabled = true, onCheatDetected, graceMs = 3000 }: AntiCheatOptions = {}) {
  const [cheatingDetected, setCheatingDetected] = useState(false);
  const cheatingRef = useRef(false);
  const activeRef = useRef(false); // Période de grâce

  const triggerCheat = useCallback(() => {
    if (cheatingRef.current) return;
    if (!activeRef.current) return; // Période de grâce active
    cheatingRef.current = true;
    setCheatingDetected(true);
    onCheatDetected?.();
  }, [onCheatDetected]);

  useEffect(() => {
    if (!enabled || cheatingRef.current) return;

    // Période de grâce : laisser la page se charger et le focus se stabiliser
    activeRef.current = false;
    const graceTimeout = setTimeout(() => {
      activeRef.current = true;
    }, graceMs);

    // ── 1. Détection changement d'onglet ──
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheat();
      }
    };

    // ── 2. Empêcher de quitter la page ──
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // ── 3. Bloquer raccourcis clavier ──
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

    // ── 4. Bloquer clic droit ──
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    // ── 5. Bloquer copier/coller ──
    const handlePaste = (e: Event) => {
      e.preventDefault();
    };
    const handleCopy = (e: Event) => {
      e.preventDefault();
    };

    // ── 6. Détection interaction avec extension IA ──
    // Si le focus va vers un élément identifié comme venant d'une extension
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (target && isExtensionElement(target)) {
        triggerCheat();
      }
    };

    // ── 7. Surveillance périodique du focus ──
    const focusCheckInterval = setInterval(() => {
      if (cheatingRef.current || !activeRef.current) return;
      const active = document.activeElement;
      if (active && isExtensionElement(active)) {
        triggerCheat();
      }
    }, 1500);

    // ── 8. MutationObserver : détecter les overlays injectés ──
    const observer = new MutationObserver((mutations) => {
      if (cheatingRef.current || !activeRef.current) return;
      for (const mutation of mutations) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;

          const tag = el.tagName?.toLowerCase();
          // Ignorer scripts, styles, meta
          if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') continue;

          // Iframe injectée = extension
          if (tag === 'iframe') {
            triggerCheat();
            return;
          }

          // Overlay visible et assez grand (> 150x150)
          if (isExtensionElement(el)) {
            triggerCheat();
            return;
          }

          // Gros élément ajouté directement au body (pas dans notre app React)
          // Seulement si c'est un enfant direct du body et qu'il est gros
          if (el.parentElement === document.body) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 200) {
              triggerCheat();
              return;
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: false });

    // Enregistrer les listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      clearTimeout(graceTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('focusin', handleFocusIn);
      clearInterval(focusCheckInterval);
      observer.disconnect();
    };
  }, [enabled, triggerCheat, graceMs]);

  return { cheatingDetected };
}
