import type { SupportedLanguage } from "./translation.definition";

export interface TranslationPersistenceAdapter {
  getString: (key: string) => Promise<string | null> | string | null;
  setString: (key: string, value: string) => Promise<void> | void;
}

export interface TranslationI18nAdapter {
  changeLanguage: (language: SupportedLanguage) => Promise<void> | void;
  getLanguage: () => string;
  onLanguageChanged: (listener: (language: string) => void) => () => void;
}

export interface CreateTranslationRuntimeInput {
  defaultLanguage: SupportedLanguage;
  i18n: TranslationI18nAdapter;
  persistence: TranslationPersistenceAdapter;
  storageKey: string;
  supportedLanguages: readonly SupportedLanguage[];
}

function resolveSupportedLanguage(
  value: string | null,
  supportedLanguages: readonly SupportedLanguage[],
  defaultLanguage: SupportedLanguage
): SupportedLanguage {
  return supportedLanguages.find((language) => language === value) ?? defaultLanguage;
}

export function createTranslationRuntime(input: CreateTranslationRuntimeInput) {
  const listeners = new Set<(language: SupportedLanguage) => void>();
  let language = resolveSupportedLanguage(
    input.i18n.getLanguage(),
    input.supportedLanguages,
    input.defaultLanguage
  );

  const unsubscribeI18n = input.i18n.onLanguageChanged((nextLanguage) => {
    language = resolveSupportedLanguage(
      nextLanguage,
      input.supportedLanguages,
      input.defaultLanguage
    );

    for (const listener of listeners) {
      listener(language);
    }
  });

  return {
    destroy() {
      unsubscribeI18n();
      listeners.clear();
    },
    getLanguage() {
      return language;
    },
    async hydrate(): Promise<SupportedLanguage> {
      const stored = await input.persistence.getString(input.storageKey);
      language = resolveSupportedLanguage(stored, input.supportedLanguages, input.defaultLanguage);
      await input.i18n.changeLanguage(language);
      return language;
    },
    async setLanguage(nextLanguage: string): Promise<SupportedLanguage> {
      const resolvedLanguage = resolveSupportedLanguage(
        nextLanguage,
        input.supportedLanguages,
        input.defaultLanguage
      );
      language = resolvedLanguage;
      await input.i18n.changeLanguage(resolvedLanguage);
      await input.persistence.setString(input.storageKey, resolvedLanguage);
      return resolvedLanguage;
    },
    subscribe(listener: (language: SupportedLanguage) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
