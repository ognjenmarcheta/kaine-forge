// Declarations for the .mjs status module, which stays .mjs so the SessionStart
// hook and `pnpm doctor` can import it without a tsx cold start.
export type GraphStatus =
  | { state: "cli-missing" }
  | { state: "absent"; versionMismatch: string | null }
  | {
      state: "fresh" | "stale";
      commits: number | null;
      files: number;
      versionMismatch: string | null;
    };

export declare const GRAPHIFY_VERSION: string;
export declare const GRAPHIFY_INSTALL: string;
export declare function probeCliVersion(cwd: string): string | null;
export declare function graphStatus(repoRoot: string, cliVersion: string | null): GraphStatus;
export declare function formatStatusLine(status: GraphStatus): string;
export declare function recordBuild(
  repoRoot: string,
  cliVersion: string | null,
  now?: number
): void;
