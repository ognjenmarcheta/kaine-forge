import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { REPO_ROOT } from "./ai.util";
import { createDashboard } from "./factory-ui";

// Browser tests use the real HTTP security headers and built assets, with intercepted APIs.
async function main(): Promise<void> {
  const prefix = path.join(tmpdir(), "kaine-ui-browser-");
  const root = mkdtempSync(prefix);
  mkdirSync(path.join(root, ".ai.local/factory"), { recursive: true });
  writeFileSync(path.join(root, ".ai.local/factory/config.json"), "{}");
  cpSync(
    path.join(REPO_ROOT, "tooling/factory-ui/dist"),
    path.join(root, "tooling/factory-ui/dist"),
    { recursive: true }
  );
  const server = await createDashboard(root, 4178);
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await server.close();
  if (!path.resolve(root).startsWith(path.resolve(prefix)))
    throw new Error("Unexpected fixture directory");
  rmSync(root, { recursive: true, force: true });
}
void main();
