'use client';

import { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from 'react';

type AtcTheme = 'light' | 'dark';

interface AtcThemeContextType {
  theme: AtcTheme;
  toggleTheme: () => void;
  setTheme: (theme: AtcTheme) => void;
}

const AtcThemeContext = createContext<AtcThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'atc-theme';

// Lecture synchrone du thème (avant le premier render React) pour éviter le FOUC
// (flash de thème clair quand le thème stocké est dark).
function readInitialTheme(): AtcTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    /* localStorage indispo */
  }
  return 'light';
}

// useLayoutEffect côté client, useEffect côté serveur (évite warning SSR).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AtcThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AtcTheme>(() => readInitialTheme());

  // Applique la classe AVANT la peinture du navigateur pour qu'aucun flash ne soit visible.
  useIsoLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (theme === 'dark') {
      document.body.classList.add('atc-dark');
      document.body.classList.remove('atc-light');
    } else {
      document.body.classList.add('atc-light');
      document.body.classList.remove('atc-dark');
    }
  }, [theme]);

  const setTheme = (newTheme: AtcTheme) => {
    setThemeState(newTheme);
    try { window.localStorage.setItem(STORAGE_KEY, newTheme); } catch { /* ignore */ }
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <AtcThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </AtcThemeContext.Provider>
  );
}

export function useAtcTheme() {
  const context = useContext(AtcThemeContext);
  if (context === undefined) {
    throw new Error('useAtcTheme must be used within an AtcThemeProvider');
  }
  return context;
}
