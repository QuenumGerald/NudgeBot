"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type ThemeContextType = {
  isDark: boolean;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("nudgebot-dark-mode");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(saved !== null ? saved === "true" : prefersDark);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("nudgebot-dark-mode", String(isDark));
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark, mounted]);

  const toggleDark = () => setIsDark(!isDark);

  // Return a safer default during SSR
  if (!mounted) {
    return (
      <ThemeContext.Provider value={{ isDark: false, toggleDark: () => {} }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useDarkMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    return { isDark: false, toggleDark: () => {} };
  }
  return context;
}
