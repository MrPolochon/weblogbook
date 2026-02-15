'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AntiCheatOptions {
  enabled?: boolean;
  onCheatDetected?: () => void;
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

    // Détection changement d'onglet / application
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheat();
      }
    };

    // Détection perte de focus fenêtre
    const handleBlur = () => {
      triggerCheat();
    };

    // Empêcher de quitter la page
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // Bloquer raccourcis clavier (copier, coller, sélectionner tout, F12, DevTools)
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        triggerCheat();
        return;
      }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
        triggerCheat();
        return;
      }
      // Ctrl+U (view source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        triggerCheat();
        return;
      }
      // Ctrl+C, Ctrl+V, Ctrl+A
      if (e.ctrlKey && ['c', 'C', 'v', 'V', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    };

    // Bloquer clic droit
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    // Détecter copier/coller dans les champs texte
    const handlePaste = (e: Event) => {
      e.preventDefault();
    };

    const handleCopy = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('copy', handleCopy);
    };
  }, [enabled, triggerCheat]);

  return { cheatingDetected };
}
