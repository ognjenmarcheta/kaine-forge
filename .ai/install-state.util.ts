import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { type Agent, REPO_ROOT } from "./ai.util";

export const agentSchema = z.enum(["claude", "codex", "cursor", "opencode", "grok"]);
const selectionFields = {
  skills: z.array(z.string().regex(/^kaine-[a-z0-9-]+$/)),
  mcps: z.array(z.string().min(1))
};
const selectionSchema = z.discriminatedUnion("schemaVersion", [
  z.object({ schemaVersion: z.literal(1), ...selectionFields }),
  z.object({
    schemaVersion: z.literal(2),
    ...selectionFields,
    ownedMcps: z.array(z.string().min(1))
  })
]);
export type InstallSelection = z.infer<typeof selectionSchema>;

/** Recorded empty selections are intentional; an empty legacy directory is not. */
export function chooseInstallSelection(input: {
  explicit: string[];
  recorded?: string[] | undefined;
  detected: string[];
  defaults: string[];
  interactive?: boolean;
}) {
  if (input.explicit.length) return { names: input.explicit, exact: true };
  if (input.interactive) return { names: input.defaults, exact: true };
  if (input.recorded !== undefined) return { names: input.recorded, exact: true };
  if (input.detected.length) return { names: input.detected, exact: true };
  return { names: input.defaults, exact: true };
}

export function managedMcpOwnership(
  previous: InstallSelection | null,
  teamNames: string[],
  personalNames: Set<string>
) {
  const previousOwned = previous?.schemaVersion === 2 ? previous.ownedMcps : [];
  return [...new Set([...teamNames, ...previousOwned])].filter((name) => !personalNames.has(name));
}

export function readInstallSelection(agent: Agent, root = REPO_ROOT): InstallSelection | null {
  const file = join(root, ".ai.local", "installations", `${agent}.json`);
  if (!existsSync(file)) return null;
  const parsed = selectionSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`Invalid ${agent} installation selection; rerun ai:install`);
  return parsed.data;
}

export function writeInstallSelection(agent: Agent, selection: InstallSelection, root = REPO_ROOT) {
  const directory = join(root, ".ai.local", "installations");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${agent}.json`),
    `${JSON.stringify(selectionSchema.parse(selection), null, 2)}\n`
  );
}
