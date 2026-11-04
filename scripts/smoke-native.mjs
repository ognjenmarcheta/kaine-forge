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
 * Check the native GPUI desktop app on this machine: start
 * `pnpm --filter @repo/desktop-native dev` against a running API, wait for its window, and
 * prove through the accessibility tree that it shows the sign-in screen. Needs the optional
 * agent-desktop CLI and a running `pnpm dev:api`. Exits 1 when a check fails. Usage:
 *   pnpm smoke:native [--api http://localhost:4000] [--timeout <ms>]
 */
const usage = "usage: pnpm smoke:native [--api <API origin URL>] [--timeout <ms>]";
const LOG_DIR = join(".ai.local", "agent-desktop");
const LOG_FILE = join(LOG_DIR, "smoke-native.log");
const A11Y_STATUS = ["org.a11y.Bus", "/org/a11y/bus", "org.a11y.Status", "IsEnabled"];

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

async function expectApi(api) {
  try {
    const response = await fetch(`${api}/health`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 200) return;
  } catch {
    /* Reported below with the fix. */
  }
  throw new SmokeFailure(`API is not answering at ${api}; start it with pnpm dev:api`);
}

/**
 * AccessKit, which GPUI uses on Linux, joins the AT-SPI bus only once the session says an
 * assistive technology is present (org.a11y.Status IsEnabled). GTK apps register regardless,
 * so the flag is often off; turn it on for the session, as a screen reader would.
 */
async function ensureAccessibilityBus() {
  if (process.platform !== "linux") return;
  const read = async () => (await run("busctl", ["--user", "get-property", ...A11Y_STATUS])).stdout;
  let state;
  try {
    state = (await read()).trim();
    if (state === "b true") return;
    await run("busctl", ["--user", "set-property", ...A11Y_STATUS, "b", "true"]);
    state = (await read()).trim();
  } catch (error) {
    throw new SmokeFailure(`cannot read the accessibility bus flag: ${error.message}`);
  }
  if (state !== "b true") {
    throw new SmokeFailure(
      "the session's accessibility bus flag (org.a11y.Status IsEnabled) stays off, so the native window cannot be inspected"
    );
  }
}

const { values } = parseArgs({
  options: {
    api: { type: "string", default: "http://localhost:4000" },
    timeout: { type: "string", default: "600000" }
  }
});
const timeoutMs = Number(values.timeout);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(usage);
  process.exit(2);
}
const api = values.api.replace(/\/+$/, "");
// The window title is the translated app name, so template adoption keeps them in step.
const WINDOW_TITLE = JSON.parse(
  readFileSync("packages/translation/src/locales/en/common.json", "utf8")
)["common.appName"];
const signInTitle = JSON.parse(
  readFileSync("packages/translation/src/locales/en/auth.json", "utf8")
)["auth.login.title"];

let app;
let failed = false;
try {
  preflight();
  console.log("PASS agent-desktop status");
  await expectApi(api);
  console.log(`PASS API ${api}`);
  await ensureAccessibilityBus();
  console.log("PASS accessibility bus");

  // A first run compiles the app, so the window wait gets the long timeout.
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(LOG_FILE, "w");
  app = spawn("pnpm", ["--filter", "@repo/desktop-native", "dev"], {
    detached: process.platform !== "win32",
    env: { ...process.env, DESKTOP_NATIVE_API_URL: api },
    stdio: ["ignore", log, log]
  });
  const exited = new Promise((_resolve, reject) => {
    app.on("error", (error) => reject(new SmokeFailure(`cannot start pnpm: ${error.message}`)));
    app.on("exit", (code) =>
      reject(
        new SmokeFailure(
          `native app exited (${code}) during the smoke; see ${LOG_FILE}` +
            " (a linker error naming xkbcommon or vulkan means the GPUI system packages are missing)"
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
  if (app?.exitCode === null) {
    app.removeAllListeners();
    try {
      if (process.platform === "win32") app.kill();
      else process.kill(-app.pid, "SIGTERM");
    } catch {
      /* Already gone. */
    }
  }
}
process.exit(failed ? 1 : 0);
