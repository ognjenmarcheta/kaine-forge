#!/usr/bin/env node

// agent-desktop CLI status, shared by the SessionStart hook and `pnpm doctor`.
// Plain .mjs so SessionStart pays no tsx cold start. The CLI is optional: agents use it
// for desktop apps, the Tauri window, and real browsers (kaine-computer-use skill).

import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** The one tested agent-desktop release; bump it deliberately, like the MCP pins. */
export const AGENT_DESKTOP_VERSION = "1.0.2";
export const AGENT_DESKTOP_INSTALL = `npm install -g agent-desktop@${AGENT_DESKTOP_VERSION}`;

const parseEnvelope = (text) => {
  try {
    const envelope = JSON.parse(String(text));
    return typeof envelope === "object" && envelope !== null ? envelope : null;
  } catch {
    return null;
  }
};

/** The `agent-desktop status` envelope, `{ ok: false }` when it is unreadable, or null when absent. */
export const probeDesktopCli = (cwd) => {
  try {
    const output = execFileSync("agent-desktop", ["status"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
      windowsHide: true
    });
    return parseEnvelope(output) ?? { ok: false };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    // A failing command still prints its error envelope on stdout.
    return parseEnvelope(error?.stdout) ?? { ok: false };
  }
};

/** @param {Record<string, unknown> | null} envelope from `probeDesktopCli` */
export const desktopStatus = (envelope) => {
  if (envelope === null) return { state: "cli-missing" };
  const data = envelope.ok === true ? envelope.data : null;
  const version = typeof data?.version === "string" ? data.version : null;
  const versionMismatch = version === null || version === AGENT_DESKTOP_VERSION ? null : version;
  // An empty surface list means the accessibility bus did not answer, not an empty desktop.
  const surfaces = Array.isArray(data?.supported_surfaces) ? data.supported_surfaces : [];
  if (surfaces.length === 0) return { state: "no-bus", versionMismatch };
  return { state: "ready", version, versionMismatch };
};

export const formatDesktopStatusLine = (status) => {
  const prefix = "- Desktop automation:";
  if (status.state === "cli-missing") {
    return `${prefix} agent-desktop CLI not installed (optional; install: ${AGENT_DESKTOP_INSTALL})`;
  }
  const mismatch = status.versionMismatch
    ? `; agent-desktop ${status.versionMismatch} installed, repo pins ${AGENT_DESKTOP_VERSION} (${AGENT_DESKTOP_INSTALL})`
    : "";
  if (status.state === "no-bus") {
    return `${prefix} agent-desktop installed, but no accessibility surface answered; run agent-desktop status in the desktop session${mismatch}`;
  }
  return `${prefix} agent-desktop ${status.version} ready for desktop apps and browsers (kaine-computer-use skill)${mismatch}`;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(
    `${formatDesktopStatusLine(desktopStatus(probeDesktopCli(process.cwd())))}\n`
  );
}
