// Declarations for the .mjs matcher. The hook must be .mjs so PreToolUse stays
// a ~1 ms file read instead of a tsx cold start on every Bash call, so the
// implementation cannot be TypeScript. This is the canonical rule shape;
// GuardRule in .ai/ai.util.ts is an alias of it.
export interface GuardedCommandRule {
  id: string;
  decision: "deny" | "ask";
  command: string;
  flag?: string;
  reason: string;
  instead?: string;
}

export declare const GUARD_DECISIONS: readonly GuardedCommandRule["decision"][];
export declare function readGuardedCommandPolicy(path: string): {
  rules: GuardedCommandRule[];
  dropped: number[];
};
export declare function loadGuardedCommandRules(path: string): GuardedCommandRule[];
export declare function stripHeredocBodies(command: string): string;
export declare function splitShellSegments(command: string): string[];
export declare function matchGuardedCommand<TRule extends GuardedCommandRule>(
  command: string,
  rules: readonly TRule[],
  shell?: "bash" | "powershell"
): TRule | null;
export declare function guardedCommandMessage(rule: { reason: string; instead?: string }): string;
