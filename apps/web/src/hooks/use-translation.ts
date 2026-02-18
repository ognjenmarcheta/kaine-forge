import { t } from "@repo/translation";
import { useContext } from "react";

import { TranslationContext } from "../providers/translation.provider";

interface UseTranslationValue {
  language: string;
  setLanguage: (value: string) => Promise<void>;
  t: (key: string) => string;
}

export function useTranslation(): UseTranslationValue {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error("useTranslation must be used inside TranslationProvider");
  }

  return {
    language: context.language,
    setLanguage: context.setLanguage,
    t
  };
}
