export const SUPPORTED_LANGUAGES = ["en", "sr", "de"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export const TRANSLATION_NAMESPACES = [
  "common",
  "auth",
  "navigation",
  "dashboard",
  "todos",
  "organizations",
  "storage",
  "assistant"
] as const;
