import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Check local storage first
    const saved = localStorage.getItem('pos_theme') as Theme;
    if (saved === 'light' || saved === 'dark') return saved;
    
    // Fallback to media query
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    // Remove both classes to start clean
    root.classList.remove('light', 'dark');
    // Add the current theme class
    root.classList.add(theme);
    // Also store it
    localStorage.setItem('pos_theme', theme);
  }, [theme]);

  // Listen to Electron theme updates if window.electron exists
  useEffect(() => {
    const win = window as any;
    if (win.electron && typeof win.electron.onThemeChanged === 'function') {
      const unsubscribe = win.electron.onThemeChanged((nativeTheme: 'light' | 'dark') => {
        setThemeState(nativeTheme);
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
