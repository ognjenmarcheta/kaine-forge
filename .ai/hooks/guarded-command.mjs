// Shared matcher for the guarded-command policy in .ai/permissions.json.
// Imported by .ai/hooks/pre-tool-use.mjs and by the OpenCode guardrail plugin,
// so the matching logic has exactly one implementation.

/** Deny is evaluated before ask, so the stronger verdict always wins. */
export const GUARD_DECISIONS = ["deny", "ask"];

const SEGMENT_SEPARATORS = /&&|\|\||[;|\n]/;

const HEREDOC_START = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/**
 * Removes heredoc bodies before matching. Their contents are data, not
 * commands: a commit message or doc that merely mentions `pnpm db:push` must
 * not be blocked as though it were running it.
 * @param {string} command
 * @returns {string}
 */
export function stripHeredocBodies(command) {
  const lines = command.split("\n");
  /** @type {string[]} */
  const kept = [];
  /** @type {string | null} */
  let terminator = null;

  for (const line of lines) {
    if (terminator === null) {
      kept.push(line);
      const start = HEREDOC_START.exec(line);
      if (start) {
        terminator = start[2];
      }
      continue;
    }
    // A `<<-` heredoc allows a tab-indented terminator.
    if (line.trim() === terminator) {
      terminator = null;
    }
  }

  return kept.join("\n");
}

/**
 * Splits a shell command into independently-executed segments, so
 * `pnpm lint && pnpm db:push` is checked as two commands rather than one.
 * @param {string} command
 * @returns {string[]}
 */
export function splitShellSegments(command) {
  return stripHeredocBodies(command)
    .split(SEGMENT_SEPARATORS)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

// Word-boundary prefix match: `git` must not match `github-cli`.
const startsWithCommand = (segment, command) =>
  segment === command || segment.startsWith(`${command} `);

// Token-exact, which is what keeps --force-with-lease out of the --force rule
// without needing an exception list.
const hasFlag = (segment, flag) => segment.split(/\s+/).includes(flag);

/**
 * @param {string} command Full command line as the agent proposed it.
 * @param {ReadonlyArray<{ id: string, decision: string, command: string, flag?: string, reason: string, instead?: string }>} rules
 * @returns {{ id: string, decision: string, command: string, flag?: string, reason: string, instead?: string } | null}
 */
export function matchGuardedCommand(command, rules) {
  if (typeof command !== "string" || command.trim() === "") {
    return null;
  }

  const segments = splitShellSegments(command).map((segment) =>
    segment.replace(/^pnpm\s+run\s+/, "pnpm ")
  );

  for (const decision of GUARD_DECISIONS) {
    for (const rule of rules) {
      if (rule.decision !== decision) {
        continue;
      }
      for (const segment of segments) {
        if (!startsWithCommand(segment, rule.command)) {
          continue;
        }
        if (rule.flag !== undefined && !hasFlag(segment, rule.flag)) {
          continue;
        }
        return rule;
      }
    }
  }

  return null;
}

/**
 * The message an agent sees. Always names the reason, and the redirect when the
 * rule carries one.
 * @param {{ reason: string, instead?: string }} rule
 * @returns {string}
 */
export function guardedCommandMessage(rule) {
  return rule.instead ? `${rule.reason} Use \`${rule.instead}\` instead.` : rule.reason;
}
