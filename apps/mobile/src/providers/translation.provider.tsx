import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  changeLanguage,
  translationInstance
} from "@repo/translation";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TRANSLATION_STORAGE_KEY = "kaine.mobile.language";

interface TranslationContextValue {
  language: string;
  setLanguage: (value: string) => Promise<void>;
}

export const TranslationContext = createContext<TranslationContextValue | null>(null);

interface TranslationProviderProps {
  children: ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const stored = await AsyncStorage.getItem(TRANSLATION_STORAGE_KEY);

      if (
        isActive &&
        stored &&
        SUPPORTED_LANGUAGES.includes(stored as (typeof SUPPORTED_LANGUAGES)[number])
      ) {
        setLanguageState(stored);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    void changeLanguage(language);
    void AsyncStorage.setItem(TRANSLATION_STORAGE_KEY, language);
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
