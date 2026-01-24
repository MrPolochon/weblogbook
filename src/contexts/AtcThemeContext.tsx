'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type AtcTheme = 'light' | 'dark';

interface AtcThemeContextType {
  theme: AtcTheme;
  toggleTheme: () => void;
  setTheme: (theme: AtcTheme) => void;
}

const AtcThemeContext = createContext<AtcThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'atc-theme';

export function AtcThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AtcTheme>('light');
  const [mounted, setMounted] = useState(false);

  // Charger le thème depuis localStorage au montage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AtcTheme | null;
    if (stored === 'dark' || stored === 'light') {
      setThemeState(stored);
    } else {
      // Vérifier si le système préfère le mode sombre
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeState(prefersDark ? 'dark' : 'light');
    }
    setMounted(true);
  }, []);

  // Appliquer la classe au body
  useEffect(() => {
    if (!mounted) return;
    
    if (theme === 'dark') {
      document.body.classList.add('atc-dark');
      document.body.classList.remove('atc-light');
    } else {
      document.body.classList.add('atc-light');
      document.body.classList.remove('atc-dark');
    }
  }, [theme, mounted]);

  const setTheme = (newTheme: AtcTheme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
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
