import {
  SUPPORTED_LANGUAGES,
  translationInstance,
  type SupportedLanguage
} from "@repo/translation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type TranslationValues = Readonly<Record<string, string | number>>;
export type Translate = (key: string, values?: TranslationValues) => string;

/**
 * Every desk string lives in the `desk` namespace. Keys are flat (`desk.area.name`). Values
 * are not HTML-escaped here: React escapes the text it renders, and escaping twice would
 * show `&#x2F;` instead of `/` in a branch or a message.
 */
export const translate: Translate = (key, values = {}) =>
  translationInstance.t(key, { ...values, ns: "desk", interpolation: { escapeValue: false } });

export const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  SUPPORTED_LANGUAGES.some((language) => language === value);

interface LanguageContextValue {
  readonly language: SupportedLanguage;
  readonly setLanguage: (language: SupportedLanguage) => void;
  readonly t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const currentLanguage = (): SupportedLanguage =>
  isSupportedLanguage(translationInstance.language) ? translationInstance.language : "en";

/**
 * Holds the language so that a change re-renders every consumer without
 * remounting the tree (drafts, focus, and scroll stay).
 */
export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(currentLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: SupportedLanguage) => {
    void translationInstance.changeLanguage(next).then(() => setLanguageState(next));
  }, []);

  const value = useMemo<LanguageContextValue>(
    // `language` is a dependency on purpose: a new `t` makes memoized children re-render.
    () => ({ language, setLanguage, t: (key, values) => translate(key, values) }),
    [language, setLanguage]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const useLanguageContext = (): LanguageContextValue => {
  const value = useContext(LanguageContext);
  if (value === null) throw new Error("LanguageProvider is missing");
  return value;
};

export const useT = (): Translate => useLanguageContext().t;
export const useLanguage = (): Pick<LanguageContextValue, "language" | "setLanguage"> => {
  const { language, setLanguage } = useLanguageContext();
  return { language, setLanguage };
};
