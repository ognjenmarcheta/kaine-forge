export const SUPPORTED_LANGUAGES = ["en", "sr", "de"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export const TRANSLATION_NAMESPACES = [
  "common",
  "auth",
  "navigation",
  "dashboard",
  "todos",
  "notes",
  "notifications",
  "organizations",
  "storage",
  "assistant",
  "desk",
  "email"
] as const;
