'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeContext = createContext({ dark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggle = () => {
    document.documentElement.classList.add('disable-transitions');
    setDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });

    // Force layout reflow
    window.getComputedStyle(document.documentElement).opacity;

    // Re-enable transitions on next frames
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('disable-transitions');
      });
    });
  };

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="fixed bottom-5 right-5 2xl:top-4 2xl:right-6 2xl:bottom-auto z-40 p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center group"
      title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
    >
      {dark ? (
        <Sun size={18} className="text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
      ) : (
        <Moon size={18} className="text-slate-500 dark:text-slate-400 group-hover:-rotate-12 transition-transform duration-300" />
      )}
    </button>
  );
}
