/* global AbortSignal, fetch */
import { execFile, spawn } from "node:child_process";
import console from "node:console";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs, promisify } from "node:util";

import {
  AGENT_DESKTOP_INSTALL,
  desktopStatus,
  probeDesktopCli
} from "../.ai/hooks/desktop-cli.mjs";

/**
 * Check the Tauri desktop shell on this machine: start `pnpm --filter @repo/desktop dev`,
 * wait for its window, and prove through the accessibility tree that it shows the sign-in
 * screen. Needs the optional agent-desktop CLI and a running `pnpm dev:web`. Exits 1 when
 * a check fails. Usage:
 *   pnpm smoke:desktop [--web http://localhost:3000] [--timeout <ms>]
 */
const usage = "usage: pnpm smoke:desktop [--web <web origin URL>] [--timeout <ms>]";
const WINDOW_TITLE = "Kaine Forge Desktop";
const LOG_DIR = join(".ai.local", "agent-desktop");
const LOG_FILE = join(LOG_DIR, "smoke-desktop.log");

const run = promisify(execFile);

class SmokeFailure extends Error {}

/** Run one agent-desktop command and return its `data`; a failed envelope throws. */
async function desktop(args, timeoutMs) {
  let stdout;
  try {
    ({ stdout } = await run("agent-desktop", args, { encoding: "utf8", timeout: timeoutMs }));
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) throw new SmokeFailure(`agent-desktop ${args[0]}: ${error.message}`);
  }
  const envelope = JSON.parse(stdout);
  if (envelope.ok !== true) {
    const { code, message } = envelope.error ?? {};
    throw new SmokeFailure(`agent-desktop ${args[0]}: ${code ?? "error"} ${message ?? ""}`.trim());
  }
  return envelope.data;
}

function preflight() {
  const status = desktopStatus(probeDesktopCli(process.cwd()));
  if (status.state === "cli-missing") {
    throw new SmokeFailure(`agent-desktop CLI not installed; install: ${AGENT_DESKTOP_INSTALL}`);
  }
  if (status.state === "no-bus") {
    throw new SmokeFailure(
      "no accessibility surface answered; run in the desktop session and check agent-desktop status"
    );
  }
}

async function expectWeb(web) {
  try {
    const response = await fetch(web, { signal: AbortSignal.timeout(5000) });
    if (response.status === 200) return;
  } catch {
    /* Reported below with the fix. */
  }
  throw new SmokeFailure(`web is not answering at ${web}; start it with pnpm dev:web`);
}

const { values } = parseArgs({
  options: {
    web: { type: "string", default: "http://localhost:3000" },
    timeout: { type: "string", default: "600000" }
  }
});
const timeoutMs = Number(values.timeout);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(usage);
  process.exit(2);
}
const signInTitle = JSON.parse(
  readFileSync("packages/translation/src/locales/en/auth.json", "utf8")
)["auth.login.title"];

let shell;
let failed = false;
try {
  preflight();
  console.log("PASS agent-desktop status");
  await expectWeb(values.web);
  console.log(`PASS web ${values.web}`);

  // A first run compiles the Rust shell, so the window wait gets the long timeout.
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(LOG_FILE, "w");
  shell = spawn("pnpm", ["--filter", "@repo/desktop", "dev"], {
    detached: process.platform !== "win32",
    stdio: ["ignore", log, log]
  });
  const exited = new Promise((_resolve, reject) => {
    shell.on("error", (error) => reject(new SmokeFailure(`cannot start pnpm: ${error.message}`)));
    shell.on("exit", (code) =>
      reject(
        new SmokeFailure(
          `desktop shell exited (${code}) during the smoke; see ${LOG_FILE}` +
            " (a libdbus-sys or webkit2gtk-sys error means the Tauri system libraries are missing)"
        )
      )
    );
  });
  // Only the races below report an exit; an exit between them must not crash the script.
  exited.catch(() => {});
  await Promise.race([
    desktop(["wait", "--window", WINDOW_TITLE, "--timeout", String(timeoutMs)], timeoutMs + 5000),
    exited
  ]);
  const windows = await desktop(["list-windows"], 15_000);
  const window = windows.find((candidate) => candidate.title === WINDOW_TITLE);
  if (!window) throw new SmokeFailure(`no window titled ${WINDOW_TITLE} in list-windows`);
  console.log(`PASS window ${WINDOW_TITLE} (${window.app_name})`);

  await Promise.race([
    desktop(
      ["wait", "--app", window.app_name, "--text", signInTitle, "--timeout", "60000"],
      65_000
    ),
    exited
  ]);
  const snapshot = await desktop(
    ["snapshot", "--app", window.app_name, "--window-id", window.id, "-i", "--compact"],
    30_000
  );
  if (!(snapshot.ref_count > 0)) throw new SmokeFailure("sign-in snapshot has no interactive refs");
  console.log(`PASS sign-in screen "${signInTitle}" with ${snapshot.ref_count} refs`);
} catch (error) {
  failed = true;
  console.error(`FAIL ${error instanceof SmokeFailure ? error.message : error}`);
} finally {
  if (shell?.exitCode === null) {
    shell.removeAllListeners();
    try {
      if (process.platform === "win32") shell.kill();
      else process.kill(-shell.pid, "SIGTERM");
    } catch {
      /* Already gone. */
    }
  }
}
process.exit(failed ? 1 : 0);
