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
  const [hiddenByScroll, setHiddenByScroll] = useState(false);

  useEffect(() => {
    let frameId: number | null = null;
    const scrollContainers = new Set<HTMLElement>();

    const syncVisibility = () => {
      frameId = null;
      const mainIsScrolled = Array.from(document.querySelectorAll<HTMLElement>('main')).some(
        (main) => main.scrollTop > 16
      );
      setHiddenByScroll(window.scrollY > 16 || mainIsScrolled);
    };

    const handleScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(syncVisibility);
    };

    const attachScrollListeners = () => {
      document.querySelectorAll<HTMLElement>('main').forEach((main) => {
        if (scrollContainers.has(main)) return;
        scrollContainers.add(main);
        main.addEventListener('scroll', handleScroll, { passive: true });
      });
      syncVisibility();
    };

    const observer = new MutationObserver(attachScrollListeners);

    attachScrollListeners();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      scrollContainers.forEach((main) => main.removeEventListener('scroll', handleScroll));
      window.removeEventListener('scroll', handleScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <button
      onClick={toggle}
      className={`absolute bottom-5 right-5 2xl:top-4 2xl:right-6 2xl:bottom-auto z-40 p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center group ${hiddenByScroll ? 'opacity-0 pointer-events-none translate-y-1' : 'opacity-100'}`}
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
