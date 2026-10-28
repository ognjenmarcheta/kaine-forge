import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

import { findContrastFailures, findTargetSizeFailures } from "./theme.contrast";
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

/** Every file `pnpm theme:build` writes, formatted as committed. */
export async function buildThemeFiles(): Promise<GeneratedFile[]> {
  const mobileCss = "apps/mobile/src/styles/global.css";

  return Promise.all([
    formatted("packages/ui/src/styles/tokens.generated.css", emitWebTokens(themes, defaultTheme)),
    formatted(
      mobileCss,
      emitMobileCss(defaultTheme, readFileSync(join(repoRoot, mobileCss), "utf8"))
    ),
    formatted("packages/mobile-ui/src/lib/design-tokens.ts", emitNativeTokens(defaultTheme)),
    formatted("packages/config/tailwind/preset.tokens.js", emitPresetTokens(defaultTheme))
  ]);
}

/** One line per contrast or target-size failure across every registered theme. */
export function describeThemeFailures(): string[] {
  return themes.flatMap((theme) => [
    ...findContrastFailures(theme).map(
      (failure) =>
        `${theme.name} ${failure.mode}: ${failure.foreground} on ${failure.background} is ` +
        `${failure.ratio.toFixed(2)}:1, needs ${failure.minimum}:1`
    ),
    ...findTargetSizeFailures(theme).map((failure) => `${theme.name}: ${failure}`)
  ]);
}
