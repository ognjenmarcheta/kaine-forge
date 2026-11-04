import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

import { SUPPORTED_LANGUAGES, TRANSLATION_NAMESPACES } from "./translation.definition";

// The native desktop app (apps/desktop-native, GPUI) reads its strings through rust-i18n, one
// flat JSON file per locale. The files hold exactly the keys the Rust sources use, so a key
// that no locale has fails `pnpm translation:build` instead of rendering at runtime (ADR 0025).

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const NATIVE_SOURCES = "apps/desktop-native/src";
const NATIVE_LOCALES = "apps/desktop-native/locales";
const LOCALES = "packages/translation/src/locales";

export interface GeneratedFile {
  /** Path from the repository root. */
  readonly path: string;
  readonly content: string;
}

/** The whole keys the Rust sources pass to `t!`. */
export function nativeKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const match of source.matchAll(/\bt!\(\s*"([A-Za-z][A-Za-z0-9._-]*)"/g)) {
    keys.add(match[1] ?? "");
  }
  return [...keys].sort();
}

/** i18next `{{name}}` placeholders as rust-i18n `%{name}` placeholders. */
export function toRustI18n(value: string): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, "%{$1}");
}

const rustSources = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) return rustSources(full);
    return name.endsWith(".rs") ? [full] : [];
  });

const readLocale = (language: string): Record<string, string> => {
  const locale: Record<string, string> = {};
  for (const namespace of TRANSLATION_NAMESPACES) {
    // SAFETY: the locale files are this package's own flat JSON objects of string values;
    // locale-consistency.test.ts checks every file against the English keys.
    const messages = JSON.parse(
      readFileSync(join(repoRoot, LOCALES, language, `${namespace}.json`), "utf8")
    ) as Record<string, string>;
    Object.assign(locale, messages);
  }
  return locale;
};

/** Every file `pnpm translation:build` writes, formatted as committed. */
export async function buildNativeLocaleFiles(): Promise<GeneratedFile[]> {
  const code = rustSources(join(repoRoot, NATIVE_SOURCES))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const keys = nativeKeys(code);
  const files: GeneratedFile[] = [];

  for (const language of SUPPORTED_LANGUAGES) {
    const locale = readLocale(language);
    const missing = keys.filter((key) => !(key in locale));
    if (missing.length > 0) {
      throw new Error(
        `${NATIVE_SOURCES} uses keys that ${LOCALES}/${language} does not define: ${missing.join(", ")}`
      );
    }
    const path = `${NATIVE_LOCALES}/${language}.json`;
    const absolute = join(repoRoot, path);
    const source = JSON.stringify(
      Object.fromEntries(keys.map((key) => [key, toRustI18n(locale[key] ?? "")])),
      null,
      2
    );
    files.push({
      path,
      content: await format(source, { ...(await resolveConfig(absolute)), filepath: absolute })
    });
  }

  return files;
}
