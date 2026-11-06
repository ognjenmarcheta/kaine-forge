import { stat } from "node:fs/promises";
import path from "node:path";

import { aiOutputSource } from "./protected-paths";

/**
 * The changed paths that `pnpm ai:install` writes from an `.ai/` source that exists in the
 * worktree. The engine regenerates them after a change to `.ai/`, and the `pre-push` hook
 * (`ai:doctor --strict`) refuses one that differs from what the generator writes.
 */
export const generatedAiOutputs = async (
  worktree: string,
  changed: readonly string[]
): Promise<Set<string>> => {
  const outputs = await Promise.all(
    changed.map(async (file) => {
      const source = aiOutputSource(file);
      if (source === null) return [];
      const found = await stat(path.join(worktree, source)).then(
        () => true,
        () => false
      );
      return found ? [file] : [];
    })
  );
  return new Set(outputs.flat());
};
