import { createSyncStoragePersistenceAdapter } from "@repo/persistence";
import {
  changeLanguage,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  translationInstance
} from "@repo/translation";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TRANSLATION_STORAGE_KEY = "kaine.language";
const persistence = createSyncStoragePersistenceAdapter(() =>
  typeof window === "undefined" ? null : window.localStorage
);

interface TranslationContextValue {
  language: string;
  setLanguage: (value: string) => Promise<void>;
}

function resolveStoredLanguage(stored: string | null): string {
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
  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);
  const [hasHydratedLanguage, setHasHydratedLanguage] = useState(false);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const stored = await persistence.getString(TRANSLATION_STORAGE_KEY);

      if (isActive) {
        setLanguageState(resolveStoredLanguage(stored));
        setHasHydratedLanguage(true);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    void changeLanguage(language);
  }, [language]);

  useEffect(() => {
    if (!hasHydratedLanguage) {
      return;
    }

    void persistence.setString(TRANSLATION_STORAGE_KEY, language);
  }, [hasHydratedLanguage, language]);

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
