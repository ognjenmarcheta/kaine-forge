import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Namespaces are discovered from the English baseline on disk so a newly added
// namespace can never silently escape this consistency guard.
const localesDir = dirname(fileURLToPath(import.meta.url));

const locales = readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

const namespaceFiles = readdirSync(join(localesDir, "en"))
  .filter((file) => file.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));

// Names, language autonyms, symbols, and terms shared with English. Each exception
// is scoped to a locale and a key, so it cannot exempt newly scaffolded copy.
const identicalValues: Readonly<Record<string, readonly string[]>> = {
  de: [
    "common.json:common.appName",
    "common.json:common.notAvailable",
    "navigation.json:navigation.languageName.en",
    "navigation.json:navigation.languageName.de",
    "navigation.json:navigation.languageName.sr",
    "navigation.json:navigation.themeSystem",
    "storage.json:storage.status",
    "todos.json:todos.ai.promptLabel"
  ],
  sr: [
    "auth.json:auth.form.emailPlaceholder",
    "common.json:common.appName",
    "common.json:common.emailLabel",
    "common.json:common.notAvailable",
    "navigation.json:navigation.languageName.en",
    "navigation.json:navigation.languageName.de",
    "navigation.json:navigation.languageName.sr",
    "storage.json:storage.status",
    "todos.json:todos.ai.promptLabel"
  ]
};

function readValues(locale: string, namespaceFile: string): Record<string, string> {
  const raw = readFileSync(join(localesDir, locale, namespaceFile), "utf8");
  const record: unknown = JSON.parse(raw);
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${locale}/${namespaceFile}: expected a translation object`);
  }
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string")
      throw new Error(`${locale}/${namespaceFile}:${key}: expected a string`);
    values[key] = value;
  }
  return values;
}

function translationProblems(
  locale: string,
  namespace: string,
  english: Readonly<Record<string, string>>,
  translated: Readonly<Record<string, string>>,
  exceptions: readonly string[]
): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(english)) {
    const identifier = `${namespace}:${key}`;
    if (translated[key] === value && !exceptions.includes(identifier)) {
      problems.push(`${locale}/${identifier}: translate the English value`);
    }
  }
  for (const exception of exceptions.filter((key) => key.startsWith(`${namespace}:`))) {
    const key = exception.slice(namespace.length + 1);
    if (
      !Object.hasOwn(english, key) ||
      !Object.hasOwn(translated, key) ||
      english[key] !== translated[key]
    ) {
      problems.push(`${locale}/${exception}: remove the stale exception`);
    }
  }
  return problems;
}

describe("translation locale consistency", () => {
  it("discovers locales and namespaces from the filesystem", () => {
    expect(locales).toContain("en");
    expect(locales.length).toBeGreaterThan(1);
    expect(namespaceFiles.length).toBeGreaterThan(0);
  });

  for (const locale of locales.filter((name) => name !== "en")) {
    it(`ships the same namespace files for ${locale} as for en`, () => {
      const files = readdirSync(join(localesDir, locale))
        .filter((file) => file.endsWith(".json"))
        .sort((left, right) => left.localeCompare(right));

      expect(files).toEqual(namespaceFiles);
    });

    it(`matches ${locale} keys with the English baseline in every namespace`, () => {
      for (const namespaceFile of namespaceFiles) {
        expect({ [namespaceFile]: Object.keys(readValues(locale, namespaceFile)).sort() }).toEqual({
          [namespaceFile]: Object.keys(readValues("en", namespaceFile)).sort()
        });
      }
    });

    it(`requires translated ${locale} values with only explicit exceptions`, () => {
      const exceptions = identicalValues[locale] ?? [];
      expect(
        namespaceFiles.flatMap((namespace) =>
          translationProblems(
            locale,
            namespace,
            readValues("en", namespace),
            readValues(locale, namespace),
            exceptions
          )
        )
      ).toEqual([]);
      for (const exception of exceptions) {
        expect(
          namespaceFiles.some((namespace) => exception.startsWith(`${namespace}:`)),
          exception
        ).toBe(true);
      }
    });
  }

  it("has no exceptions for removed locales or duplicate keys", () => {
    for (const [locale, exceptions] of Object.entries(identicalValues)) {
      expect(locales).toContain(locale);
      expect(new Set(exceptions).size).toBe(exceptions.length);
    }
  });
});

describe("translation value gate", () => {
  it("rejects English feature copy and navigation labels", () => {
    expect(
      translationProblems(
        "de",
        "probes.json",
        { "probes.titleLabel": "Title" },
        { "probes.titleLabel": "Title" },
        []
      )
    ).toEqual(["de/probes.json:probes.titleLabel: translate the English value"]);
    expect(
      translationProblems(
        "sr",
        "navigation.json",
        { "navigation.probes": "Probes" },
        { "navigation.probes": "Probes" },
        []
      )
    ).toEqual(["sr/navigation.json:navigation.probes: translate the English value"]);
  });

  it("accepts translated text and an explicitly permitted shared term", () => {
    expect(
      translationProblems(
        "de",
        "common.json",
        { title: "Title", name: "Kaine Forge" },
        { title: "Titel", name: "Kaine Forge" },
        ["common.json:name"]
      )
    ).toEqual([]);
  });

  it.each([{ name: "Name" }, {}])(
    "rejects stale exceptions when text changes or disappears",
    (translated) => {
      expect(
        translationProblems("de", "common.json", { name: "Kaine Forge" }, translated, [
          "common.json:name"
        ])
      ).toEqual(["de/common.json:name: remove the stale exception"]);
    }
  );
});
