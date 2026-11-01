// Declarations for the .mjs status module, which stays .mjs so the SessionStart
// hook and `pnpm doctor` can import it without a tsx cold start.
export type DesktopStatus =
  | { state: "cli-missing" }
  | { state: "no-bus"; versionMismatch: string | null }
  | { state: "ready"; version: string | null; versionMismatch: string | null };

export type DesktopStatusEnvelope = { ok?: unknown; data?: unknown };

export declare const AGENT_DESKTOP_VERSION: string;
export declare const AGENT_DESKTOP_INSTALL: string;
export declare function probeDesktopCli(cwd: string): DesktopStatusEnvelope | null;
export declare function desktopStatus(envelope: DesktopStatusEnvelope | null): DesktopStatus;
export declare function formatDesktopStatusLine(status: DesktopStatus): string;
