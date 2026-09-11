// Declarations for the .mjs matcher. The hook must be .mjs so PreToolUse stays
// a ~1 ms file read instead of a tsx cold start on every Bash call, so the
// implementation cannot be TypeScript. GuardRule in .ai/ai.util.ts is the
// canonical shape; callers passing it here are structurally checked, so a
// divergence between the two fails pnpm ai:typecheck.
export interface GuardedCommandRule {
  id: string;
  decision: string;
  command: string;
  flag?: string;
  reason: string;
  instead?: string;
}

export declare const GUARD_DECISIONS: readonly string[];
export declare function stripHeredocBodies(command: string): string;
export declare function splitShellSegments(command: string): string[];
export declare function matchGuardedCommand<TRule extends GuardedCommandRule>(
  command: string,
  rules: readonly TRule[]
): TRule | null;
export declare function guardedCommandMessage(rule: { reason: string; instead?: string }): string;
