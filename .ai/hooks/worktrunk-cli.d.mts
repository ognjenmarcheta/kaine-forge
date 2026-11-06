// Declarations for the .mjs status module, which stays .mjs so the SessionStart
// hook and `pnpm doctor` can import it without a tsx cold start.
export declare const WORKTRUNK_VERSION: string;
export declare const WORKTRUNK_INSTALL: string;
export declare function probeWorktrunkVersion(cwd: string): string | null;
export declare function formatWorktrunkStatusLine(version: string | null): string;
