import { lint } from "@google/design.md/linter";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

import { ensureContrast } from "./theme.color";
import { findContrastFailures, findTargetSizeFailures, resolveColor } from "./theme.contrast";
import { rootDesignCopy, withDesignTokens } from "./theme.design";
import { emitMobileCss, emitNativeTokens, emitPresetTokens, emitWebTokens } from "./theme.emit";
import { defaultTheme, themes } from "./themes.config";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface GeneratedFile {
  /** Path from the repository root. */
  readonly path: string;
  readonly content: string;
}

async function formatted(path: string, source: string): Promise<GeneratedFile> {
  const absolute = join(repoRoot, path);
  const content = await format(source, {
    ...(await resolveConfig(absolute)),
    filepath: absolute
  });

  return { path, content };
}

const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

/** The browser theme-color tags follow the default theme surface in each mode. */
function withThemeColor(html: string): string {
  return html.replace(
    /(<meta name="theme-color" media="\(prefers-color-scheme: (light|dark)\)" content=")#[0-9a-f]{6}(")/g,
    (_match, start: string, mode: "light" | "dark", end: string) =>
      `${start}${defaultTheme.modes[mode].surface}${end}`
  );
}

/** The native splash screens follow the default theme surface in each mode. */
function withSplashColors(appJson: string): string {
  return appJson
    .replace(
      /("splash": \{[^}]*?"backgroundColor": ")#[0-9a-f]{6}(")/g,
      `$1${defaultTheme.modes.light.surface}$2`
    )
    .replace(
      /("dark": \{[^}]*?"backgroundColor": ")#[0-9a-f]{6}(")/g,
      `$1${defaultTheme.modes.dark.surface}$2`
    );
}

const designPath = (name: string): string => `packages/theme/src/themes/${name}/DESIGN.md`;

/** Every file `pnpm theme:build` writes, formatted as committed. */
export async function buildThemeFiles(): Promise<GeneratedFile[]> {
  const mobileCss = "apps/mobile/src/styles/global.css";
  const designs = await Promise.all(
    themes.map((theme) =>
      formatted(designPath(theme.name), withDesignTokens(read(designPath(theme.name)), theme))
    )
  );
  const defaultDesign = designs[themes.indexOf(defaultTheme)];

  if (!defaultDesign) {
    throw new Error("the default theme is not registered");
  }

  const files = await Promise.all([
    formatted("packages/ui/src/styles/tokens.generated.css", emitWebTokens(themes, defaultTheme)),
    formatted(mobileCss, emitMobileCss(defaultTheme, read(mobileCss))),
    formatted(
      "packages/mobile-ui/src/lib/design-tokens.ts",
      emitNativeTokens(themes, defaultTheme)
    ),
    formatted("packages/config/tailwind/preset.tokens.js", emitPresetTokens(defaultTheme)),
    formatted("apps/web/index.html", withThemeColor(read("apps/web/index.html"))),
    formatted("apps/mobile/app.json", withSplashColors(read("apps/mobile/app.json"))),
    formatted("DESIGN.md", rootDesignCopy(defaultDesign.content, defaultDesign.path))
  ]);

  return [...files, ...designs];
}

/** One line per contrast or target-size failure across every registered theme. */
export function describeThemeFailures(): string[] {
  return themes.flatMap((theme) => [
    ...findContrastFailures(theme).map((failure) => {
      const foreground = resolveColor(theme, failure.mode, failure.foreground);
      const background = resolveColor(theme, failure.mode, failure.background);
      const nearest = ensureContrast(foreground, background, failure.minimum);

      return (
        `${theme.name} ${failure.mode}: ${failure.foreground} on ${failure.background} is ` +
        `${failure.ratio.toFixed(2)}:1, needs ${failure.minimum}:1; the nearest passing ` +
        `${failure.foreground} is ${nearest}`
      );
    }),
    ...findTargetSizeFailures(theme).map((failure) => `${theme.name}: ${failure}`)
  ]);
}

/** One line per DESIGN.md lint error or warning from the pinned @google/design.md linter. */
export function describeDesignFindings(files: readonly GeneratedFile[]): string[] {
  return files
    .filter((file) => file.path.endsWith("DESIGN.md"))
    .flatMap((file) =>
      lint(file.content)
        .findings.filter((finding) => finding.severity !== "info")
        .map((finding) =>
          `${file.path}: ${finding.severity} ${finding.path ?? ""} ${finding.message}`.replace(
            / +/g,
            " "
          )
        )
    );
}
