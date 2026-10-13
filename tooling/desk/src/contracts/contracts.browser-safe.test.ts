import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIRECTORY = import.meta.dirname;

const sources = readdirSync(DIRECTORY).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
);

const importsOf = (text: string): string[] =>
  [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]])
  );

describe("contracts stay browser-safe", () => {
  it("finds the contract files", () => {
    expect(sources).toEqual(
      expect.arrayContaining(["api.contract.ts", "flow.model.ts", "pipeline.contract.ts"])
    );
  });

  it.each(sources)("%s imports only zod and sibling contracts", (name) => {
    const imports = importsOf(readFileSync(path.join(DIRECTORY, name), "utf8"));
    for (const specifier of imports) {
      expect(specifier === "zod" || /^\.\/[\w.-]+$/.test(specifier), `${name}: ${specifier}`).toBe(
        true
      );
    }
  });
});
