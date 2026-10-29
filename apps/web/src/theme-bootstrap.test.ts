import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");

describe("color mode before first paint", () => {
  it.each([
    [null, false, "light"],
    [null, true, "dark"],
    ['{"state":{"themeMode":"light"}}', true, "light"],
    ['{"state":{"themeMode":"dark"}}', false, "dark"],
    ['{"state":{"themeMode":"system"}}', true, "dark"],
    ["invalid json", true, "dark"],
    ['{"state":{"themeMode":"invalid"}}', false, "light"]
  ])("resolves stored %s with system dark=%s to %s", (stored, dark, expected) => {
    const document = { documentElement: { dataset: { colorMode: "" } } };
    runInNewContext(source, {
      document,
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: dark })
    });
    expect(document.documentElement.dataset.colorMode).toBe(expected);
  });

  it("uses system appearance when storage is blocked", () => {
    const document = { documentElement: { dataset: { colorMode: "" } } };
    runInNewContext(source, {
      document,
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        }
      },
      matchMedia: () => ({ matches: true })
    });
    expect(document.documentElement.dataset.colorMode).toBe("dark");
  });
});

describe("Organization Theme before first paint", () => {
  it.each([
    ["moss", "moss"],
    ['moss" onload="x', undefined],
    [null, undefined]
  ])("applies the cached theme name %j as %j", (cached, expected) => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(source, {
      document,
      localStorage: { getItem: (key: string) => (key === "kaine.theme.name" ? cached : null) },
      matchMedia: () => ({ matches: false })
    });
    expect(document.documentElement.dataset["theme"]).toBe(expected);
  });
});
