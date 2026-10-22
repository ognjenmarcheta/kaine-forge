import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FlowSnapshot, FlowStep } from "../contracts";
import { builtinFlowSnapshot } from "../registry/registry.snapshot";

/**
 * Flow fixtures for tests: the built-in default snapshot that a new issue gets with the
 * default config, and the files that install what the built-in agents ask for in a test checkout.
 * Production code never imports this file.
 */

export const DEFAULT_SNAPSHOT: FlowSnapshot = await builtinFlowSnapshot();

/**
 * What a checkout must install for the built-in agents to get everything they ask for: the
 * MCP servers and skills their frontmatter names. A run drops what is not installed.
 */
export const INSTALLED_FILES: Readonly<Record<string, string>> = {
  ".ai/mcp.json": `${JSON.stringify({ mcpServers: { serena: {}, context7: {} } })}\n`,
  ...Object.fromEntries(
    ["kaine-intake", "kaine-write-issue", "kaine-write-plan", "kaine-test", "kaine-review"].map(
      (skill) => [`.ai/skills/${skill}.md`, `---\nname: ${skill}\n---\n${skill}\n`]
    )
  )
};

/** Write `files` (repository-relative paths) under `root`. */
export const writeFiles = async (
  root: string,
  files: Readonly<Record<string, string>>
): Promise<void> => {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
};

/**
 * The snapshot with other loop-back limits, by step id, and another PR round limit. The
 * test form of a flow file with other limits, or of the config limits on the default flow.
 */
export const withLimits = (
  snapshot: FlowSnapshot,
  limits: Readonly<Record<string, number>>,
  prRounds?: number
): FlowSnapshot => ({
  ...snapshot,
  flow: {
    ...snapshot.flow,
    steps: snapshot.flow.steps.map((step): FlowStep => {
      if (step.kind === "pr-wait" && prRounds !== undefined)
        return { ...step, maxRounds: prRounds };
      const limit = limits[step.id];
      return limit === undefined || step.loopBack === undefined
        ? step
        : { ...step, loopBack: { ...step.loopBack, limit } };
    })
  }
});
