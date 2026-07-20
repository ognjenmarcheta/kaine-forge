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

function sortedKeys(locale: string, namespaceFile: string): string[] {
  const raw = readFileSync(join(localesDir, locale, namespaceFile), "utf8");
  const record = JSON.parse(raw) as Record<string, unknown>;
  return Object.keys(record).sort((left, right) => left.localeCompare(right));
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
        expect({ [namespaceFile]: sortedKeys(locale, namespaceFile) }).toEqual({
          [namespaceFile]: sortedKeys("en", namespaceFile)
        });
      }
    });
  }
});
