import { describe, expect, it } from "vitest";

import { translationInstance } from "./translation.config";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  TRANSLATION_NAMESPACES
} from "./translation.definition";
import { createTranslationRuntime } from "./translation.runtime";

describe("translation.config", () => {
  it("loads configured languages", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const namespace of TRANSLATION_NAMESPACES) {
        expect(translationInstance.hasResourceBundle(language, namespace)).toBe(true);
      }
    }
  });

  it("returns translated keys for known entries", async () => {
    await translationInstance.changeLanguage("en");
    expect(translationInstance.t("common.appName")).toBe("Kaine Forge");

    await translationInstance.changeLanguage("de");
    expect(translationInstance.t("navigation.todos")).toBe("Aufgaben");
  });

  it("hydrates, validates, and persists language through the runtime Module", async () => {
    const written: string[] = [];
    let currentLanguage = DEFAULT_LANGUAGE;
    const listeners = new Set<(language: string) => void>();
    const runtime = createTranslationRuntime({
      defaultLanguage: DEFAULT_LANGUAGE,
      i18n: {
        changeLanguage: async (language) => {
          currentLanguage = language;
          for (const listener of listeners) {
            listener(language);
          }
        },
        getLanguage: () => currentLanguage,
        onLanguageChanged: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }
      },
      persistence: {
        getString: async () => "missing",
        setString: async (_key, value) => {
          written.push(value);
        }
      },
      storageKey: "kaine.language",
      supportedLanguages: SUPPORTED_LANGUAGES
    });

    expect(await runtime.hydrate()).toBe(DEFAULT_LANGUAGE);

    const unsubscribe = runtime.subscribe((language) => {
      written.push(`event:${language}`);
    });
    await runtime.setLanguage("sr");
    unsubscribe();

    expect(runtime.getLanguage()).toBe("sr");
    expect(written).toEqual(["event:sr", "sr"]);
  });
});
