import {
  changeLanguage,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  translationInstance
} from "@repo/translation";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TRANSLATION_STORAGE_KEY = "kaine.language";

interface TranslationContextValue {
  language: string;
  setLanguage: (value: string) => Promise<void>;
}

function getStoredLanguage(): string {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const stored = window.localStorage.getItem(TRANSLATION_STORAGE_KEY);

  if (stored && SUPPORTED_LANGUAGES.includes(stored as (typeof SUPPORTED_LANGUAGES)[number])) {
    return stored;
  }

  return DEFAULT_LANGUAGE;
}

export const TranslationContext = createContext<TranslationContextValue | null>(null);

interface TranslationProviderProps {
  children: ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const [language, setLanguageState] = useState(() => getStoredLanguage());

  useEffect(() => {
    void changeLanguage(language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TRANSLATION_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    const onChange = (nextLanguage: string) => {
      setLanguageState(nextLanguage);
    };

    translationInstance.on("languageChanged", onChange);

    return () => {
      translationInstance.off("languageChanged", onChange);
    };
  }, []);

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage: async (value) => {
        await changeLanguage(value);
        setLanguageState(value);
      }
    }),
    [language]
  );

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}
