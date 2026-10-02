import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { REPO_ROOT } from "./ai.util";

export const CONTROLLER_VERSION = "2";
export const checkoutSchema = z.object({
  id: z.string(),
  path: z.string(),
  branch: z.string(),
  available: z.boolean(),
  configured: z.boolean()
});
export type FactoryCheckout = z.infer<typeof checkoutSchema>;
function query(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
export function commonDirectory(root: string): string {
  return path.resolve(root, query(root, ["rev-parse", "--git-common-dir"]));
}
export function checkoutId(root: string): string {
  const normalized = path.resolve(root).replaceAll("\\", "/");
  return createHash("sha256")
    .update(process.platform === "win32" ? normalized.toLowerCase() : normalized)
    .digest("hex")
    .slice(0, 24);
}
export function discoverCheckouts(root: string): FactoryCheckout[] {
  let output: string;
  try {
    output = query(root, ["worktree", "list", "--porcelain", "-z"]);
  } catch {
    return [
      {
        id: checkoutId(root),
        path: root,
        branch: "",
        available: existsSync(root),
        configured: existsSync(path.join(root, ".ai.local/factory/config.json"))
      }
    ];
  }
  return output
    .split("\0\0")
    .filter(Boolean)
    .map((record) => {
      const entries = record.split("\0");
      const directory = entries.find((entry) => entry.startsWith("worktree "))?.slice(9);
      if (!directory) throw new Error("Invalid Git worktree record");
      const resolved = path.resolve(directory);
      return {
        id: checkoutId(resolved),
        path: resolved,
        branch:
          entries
            .find((entry) => entry.startsWith("branch "))
            ?.slice(7)
            .replace(/^refs\/heads\//, "") ?? "detached",
        available: existsSync(resolved),
        configured: existsSync(path.join(resolved, ".ai.local/factory/config.json"))
      };
    });
}
export function resolveCheckout(root: string, requested: string): FactoryCheckout {
  const result = discoverCheckouts(root).find((entry) => entry.id === requested);
  if (
    !result?.available ||
    commonDirectory(realpathSync(result.path)) !== commonDirectory(realpathSync(root))
  )
    throw new Error("Checkout is unavailable or outside this repository");
  return result;
}
let selected = REPO_ROOT;
export function selectCheckout(root: string): void {
  selected = resolveCheckout(REPO_ROOT, checkoutId(root)).path;
}
export function selectedCheckout(): string {
  return selected;
}
