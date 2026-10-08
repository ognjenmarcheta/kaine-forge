import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import process from "node:process";

import { proxyEnvironment, startBridge } from "./desk-bridge.mjs";

// Copied from the software factory (.ai/docker/factory-fetch.mjs). Fills the pnpm
// store and the virtual store from the lockfile through the registry-only proxy. It
// runs no repository script (`--ignore-scripts --ignore-pnpmfile`). The container has
// no network interface: its only way out is the proxy socket.
if (
  Object.values(networkInterfaces())
    .flat()
    .some((item) => item && !item.internal)
)
  throw new Error("Dependency fetch must not have a network interface");
const bridge = await startBridge();
const child = spawn(
  "pnpm",
  ["fetch", "--ignore-scripts", "--ignore-pnpmfile", "--store-dir", "/store", "--fetch-retries=2"],
  {
    cwd: "/workspace",
    env: { ...process.env, ...proxyEnvironment(), CI: "true" },
    stdio: "inherit"
  }
);
child.once("error", () => process.exit(1));
const code = await new Promise((resolve) => child.once("close", resolve));
bridge.close();
process.exit(code ?? 1);
