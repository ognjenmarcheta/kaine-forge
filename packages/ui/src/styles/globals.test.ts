import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "globals.css"), "utf8");
const require = createRequire(import.meta.url);

/** Builds the CSS Tailwind generates for `candidates` from the real stylesheet. */
async function buildUtilities(candidates: string[]): Promise<string> {
  const compiler = await compile(css.replace(/@import "@fontsource[^;]+;\n/g, ""), {
    base: here,
    loadStylesheet: async (id, base) => {
      const path =
        id === "tailwindcss" ? require.resolve("tailwindcss/index.css") : resolve(base, id);
      return { content: readFileSync(path, "utf8"), base: dirname(path), path };
    }
  });

  return compiler.build(candidates);
}

describe("globals.css", () => {
  it("does not contain shadcn bridge variable definitions", () => {
    expect(css).not.toContain("--background: var(--ds-");
    expect(css).not.toContain("--foreground: var(--ds-");
    expect(css).not.toContain("--primary: var(--ds-");
    expect(css).not.toContain("--muted: var(--ds-");
    expect(css).not.toContain("--accent: var(--ds-");
    expect(css).not.toContain("--destructive: var(--ds-");
    expect(css).not.toContain("--sidebar: var(--ds-");
  });
});

describe("theme utilities", () => {
  const themed = [
    ["text-ds-text-subtle", "color: var(--ds-text-subtle)"],
    ["bg-ds-bg-neutral-hovered", "background-color: var(--ds-background-neutral-hovered)"],
    ["bg-ds-surface-raised", "background-color: var(--ds-surface-raised)"],
    ["border-ds-border-focused", "border-color: var(--ds-border-focused)"],
    ["gap-ds-150", "gap: var(--ds-space-150)"],
    ["h-ds-control-medium", "height: var(--ds-control-medium)"],
    ["rounded-xl", "border-radius: var(--ds-radius-300)"],
    ["shadow-raised", "--tw-shadow: var(--ds-shadow-raised)"],
    ["text-heading-sm", "font: var(--ds-font-heading-small)"],
    ["text-body", "font: var(--ds-font-body)"],
    ["font-semibold", "font-weight: var(--ds-font-weight-semibold)"]
  ] as const;
  const removed = ["bg-red-500", "text-white", "text-sm", "shadow-sm", "rounded-2xl"] as const;
  let output = "";

  beforeAll(async () => {
    output = await buildUtilities([...themed.map(([candidate]) => candidate), ...removed]);
  });

  it.each(themed)("%s reads its theme token", (candidate, declaration) => {
    const rule = output.slice(output.indexOf(`.${candidate} {`));

    expect(rule.slice(0, rule.indexOf("}"))).toContain(declaration);
  });

  it.each(removed)("%s from the default Tailwind scale generates no CSS", (candidate) => {
    expect(output).not.toContain(`.${candidate} {`);
  });

  it("lets a weight utility override the weight of a type utility", async () => {
    const pair = await buildUtilities(["text-body", "font-semibold"]);

    expect(pair.indexOf(".text-body {")).toBeLessThan(pair.indexOf(".font-semibold {"));
  });
});
