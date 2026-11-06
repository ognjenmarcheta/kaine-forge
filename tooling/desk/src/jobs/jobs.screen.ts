import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MAX_REFERENCE_BYTES,
  REFERENCE_TYPES,
  type ScreenJobResult,
  type ScreenSpec
} from "../contracts";
import { screenFolder } from "./jobs.permissions";

/**
 * The screen job: recreate one reference image as a lab screen. Its prompt, the reference
 * file, the checks the engine runs after the build, and its pull request.
 */

/** A reference the job refuses. The message is the reason. */
export class ReferenceError extends Error {
  override readonly name = "ReferenceError";
}

const startsWith = (bytes: Buffer, prefix: readonly number[], offset = 0): boolean =>
  prefix.every((value, index) => bytes[offset + index] === value);

/** The image type the bytes really are, whatever the request said. */
const sniff = (bytes: Buffer): keyof typeof REFERENCE_TYPES | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
};

/**
 * The reference image as bytes, checked: real base64, at most `MAX_REFERENCE_BYTES`, and the
 * image type it claims (by its first bytes). Returns its file name for the screen.
 */
export const decodeReference = (
  screenId: string,
  reference: { readonly mediaType: keyof typeof REFERENCE_TYPES; readonly dataBase64: string }
): { readonly fileName: string; readonly bytes: Buffer } => {
  const bytes = Buffer.from(reference.dataBase64, "base64");
  if (bytes.length === 0) throw new ReferenceError("The reference image is empty.");
  if (bytes.length > MAX_REFERENCE_BYTES) {
    throw new ReferenceError(
      `The reference image is larger than ${MAX_REFERENCE_BYTES / 1024 / 1024} MB.`
    );
  }
  const actual = sniff(bytes);
  if (actual !== reference.mediaType) {
    throw new ReferenceError(`The reference is not a ${reference.mediaType} image.`);
  }
  return { fileName: `${screenId}.${REFERENCE_TYPES[actual]}`, bytes };
};

/** Write the reference where the lab serves it: `tooling/desk-ui/public/references/` (gitignored). */
export const writeReference = async (
  worktree: string,
  fileName: string,
  bytes: Buffer
): Promise<string> => {
  const dir = path.join(worktree, "tooling", "desk-ui", "public", "references");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, path.basename(fileName));
  await writeFile(file, bytes);
  return file;
};

export interface ScreenPromptInput {
  readonly screen: ScreenSpec;
  readonly referencePath: string;
  readonly labUrl: string;
  readonly note: string;
  readonly feedback: readonly string[];
}

export const screenPrompt = (input: ScreenPromptInput): string => {
  const { screen } = input;
  const folder = screenFolder(screen.id);
  const compare = input.labUrl.replace("/lab-frame.html", `/?view=lab#/compare/${screen.id}`);
  return [
    `You are the agent desk's screen job. Recreate the reference image as the lab screen ${screen.id} ("${screen.title}").`,
    "",
    "Call the Skill tool with kaine-build-ui first and follow its reference-image mode. Read tooling/desk-ui/src/lab/screens/README.md for the folder rules.",
    "",
    `- The reference image is ${input.referencePath}. Read it with the Read tool; you can see images.`,
    `- Write only in ${folder}/: ${screen.id}.theme.ts (a lab theme named lab-${screen.id}, made with createTheme), ${screen.id}.screen.tsx (exports \`screen: LabScreen\` with id "${screen.id}", title "${screen.title}", mode "${screen.mode}", width ${screen.width}, height ${screen.height}, reference "${screen.reference}"), and ${screen.id}.notes.md.`,
    `- The job's lab server runs for you. The frame page is ${input.labUrl}#/screens/${screen.id}/${screen.mode} and the compare view is ${compare}. Look at them with the Playwright browser tools.`,
    `- Measure with \`pnpm lab:diff ${screen.id}\` (LAB_URL is set), and read shots/${screen.id}.diffmap.png. \`pnpm lab:shots ${screen.id}\` writes the side-by-side. Loop as the skill says: fix the largest difference, measure again.`,
    "- Before you answer, run `pnpm --filter @repo/desk-ui test`, `pnpm --filter @repo/desk-ui lint`, `pnpm --filter @repo/desk-ui typecheck`, and `pnpm ui:check`, and fix what fails in your folder.",
    "- You may start subagents with the Agent tool, for example to audit the finished screen with kaine-audit-ui. They have your permissions.",
    "- deviations: one entry per rule the screen breaks on purpose to match the reference, with the rule ID, what changed, and why.",
    "",
    `Owner note: ${input.note.trim() === "" ? "none" : input.note.trim()}`,
    ...(input.feedback.length === 0
      ? []
      : [
          "",
          "The owner sent the last result back from the gate. Address every note, newest last:",
          ...input.feedback.map((note) => `- ${note}`)
        ])
  ].join("\n");
};

/** What the engine runs after the build. Any failure stops the job with its output. */
export const screenChecks = (screenId: string): readonly (readonly string[])[] => [
  ["pnpm", "--filter", "@repo/desk-ui", "exec", "vitest", "run", "src/lab"],
  ["pnpm", "--filter", "@repo/desk-ui", "exec", "eslint", `src/lab/screens/${screenId}`],
  ["pnpm", "--filter", "@repo/desk-ui", "typecheck"],
  ["pnpm", "ui:check"]
];

/** The share of differing pixels from `lab:diff --json`, or `null` when it reports none. */
export const diffPercentOf = (stdout: string, screenId: string): number | null => {
  const start = stdout.indexOf("[");
  if (start === -1) return null;
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start));
    if (!Array.isArray(parsed)) return null;
    for (const entry of parsed) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "id" in entry &&
        entry.id === screenId &&
        "differing" in entry &&
        typeof entry.differing === "number"
      ) {
        return entry.differing;
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const screenPullRequest = (
  screen: ScreenSpec,
  result: ScreenJobResult,
  diffPercent: number | null
): { readonly title: string; readonly body: string } => ({
  title: `feat(lab): recreate ${screen.title.toLowerCase()} as lab screen ${screen.id}`,
  body: [
    "## Summary",
    "",
    result.summary,
    "",
    `Lab screen \`${screen.id}\` (${screen.width}×${screen.height}, ${screen.mode}). ${
      diffPercent === null
        ? "No diff measured."
        : `${diffPercent}% of pixels still differ from the reference (\`pnpm lab:diff\`).`
    } The reference image stays local (gitignored).`,
    "",
    "## Deviations",
    "",
    ...(result.deviations.length === 0
      ? ["None."]
      : result.deviations.map((entry) => `- ${entry}`)),
    "",
    "## In plain language",
    "",
    result.plainLanguage
  ].join("\n")
});
