import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersistenceAdapter } from "@repo/persistence";
import {
  createTranslationRuntime,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  changeLanguage,
  translationInstance
} from "@repo/translation";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TRANSLATION_STORAGE_KEY = "kaine.mobile.language";
const persistence = createAsyncStoragePersistenceAdapter(AsyncStorage);

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
  const translationRuntime = useMemo(
    () =>
      createTranslationRuntime({
        defaultLanguage: DEFAULT_LANGUAGE,
        i18n: {
          changeLanguage,
          getLanguage: () => translationInstance.language,
          onLanguageChanged: (listener) => {
            translationInstance.on("languageChanged", listener);
            return () => {
              translationInstance.off("languageChanged", listener);
            };
          }
        },
        persistence,
        storageKey: TRANSLATION_STORAGE_KEY,
        supportedLanguages: SUPPORTED_LANGUAGES
      }),
    []
  );

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const nextLanguage = await translationRuntime.hydrate();

      if (isActive) {
        setLanguageState(nextLanguage);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [translationRuntime]);

  useEffect(() => {
    const unsubscribe = translationRuntime.subscribe((nextLanguage) => {
      setLanguageState(nextLanguage);
    });

    return () => {
      unsubscribe();
    };
  }, [translationRuntime]);

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage: async (value) => {
        setLanguageState(await translationRuntime.setLanguage(value));
      }
    }),
    [language, translationRuntime]
  );

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}
