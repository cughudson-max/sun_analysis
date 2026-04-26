import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, translations, TranslationKeys } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKeys;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = '3dm-viewer-language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en')) {
        return saved as Language;
      }
    }
    return 'zh-CN';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en')) {
      setLanguageState(saved as Language);
    }
  }, []);

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export function useTranslation() {
  const { language, setLanguage, t } = useLanguage();

  const translate = useCallback((key: string): string => {
    const keys = key.split('.');
    let result: any = t;
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return key;
      }
    }
    return typeof result === 'string' ? result : key;
  }, [t]);

  return { language, setLanguage, t, translate };
}