// Shared matcher for the guarded-command policy in .ai/permissions.json.
// Imported by .ai/hooks/pre-tool-use.mjs and by the OpenCode guardrail plugin,
// so the matching logic has exactly one implementation.

/** Deny is evaluated before ask, so the stronger verdict always wins. */
export const GUARD_DECISIONS = ["deny", "ask"];

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
  return scanCommands(stripHeredocBodies(command), "bash").map((segment) => segment.source);
}

/** Tokenize literal commands only; this deliberately does not evaluate shell expressions.
 * @param {string} command
 * @param {"bash" | "powershell"} shell
 * @returns {{source: string, tokens: string[]}[]}
 */
function scanCommands(command, shell) {
  const segments = [];
  let tokens = [];
  let token = "";
  let started = false;
  let quote = "";
  let start = 0;
  const flushToken = () => {
    if (started) tokens.push(token);
    token = "";
    started = false;
  };
  const flushSegment = (end) => {
    flushToken();
    const source = command.slice(start, end).trim();
    if (source) segments.push({ source, tokens });
    tokens = [];
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    const next = command[index + 1];
    const escape = shell === "powershell" ? "`" : "\\";
    if (
      char === escape &&
      quote !== "'" &&
      next !== undefined &&
      (shell === "powershell" || quote !== '"' || '$`"\\\n'.includes(next))
    ) {
      if (next !== "\n") {
        token += next;
        started = true;
      }
      index++;
    } else if (quote) {
      if (char === quote) {
        if (shell === "powershell" && quote === "'" && next === "'") {
          token += "'";
          index++;
        } else quote = "";
      } else token += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === ";" || char === "|" || char === "\n" || (char === "&" && next === "&")) {
      flushSegment(index);
      if (next === char && (char === "|" || char === "&")) index++;
      start = index + 1;
    } else if (/\s/.test(char)) flushToken();
    else {
      token += char;
      started = true;
    }
  }
  flushSegment(command.length);
  return segments;
}

/** @param {string[]} tokens @returns {string[]} */
function normalizeCommand(tokens) {
  const [executable, ...args] = tokens;
  if (executable !== "pnpm" && executable !== "git") return tokens;
  const valued = executable === "pnpm" ? ["--filter", "-C", "--dir"] : ["-C"];
  let index = 0;
  while (index < args.length) {
    if (valued.includes(args[index]) && args[index + 1] !== undefined) index += 2;
    else if (executable === "pnpm" && /^(--filter|--dir)=/.test(args[index])) index++;
    else break;
  }
  if (executable === "pnpm" && args[index] === "run") index++;
  return [executable, ...args.slice(index)];
}

/** Command-specific option values are data even when they spell a guarded flag.
 * @param {string[]} tokens @param {string} flag @returns {boolean}
 */
function hasFlag(tokens, flag) {
  const valued =
    tokens[0] === "git" && tokens[1] === "commit"
      ? [
          "-m",
          "--message",
          "-F",
          "--file",
          "-C",
          "--reuse-message",
          "-c",
          "--reedit-message",
          "--author",
          "--date",
          "-t",
          "--template",
          "--cleanup",
          "--trailer",
          "--pathspec-from-file",
          "--fixup",
          "--squash"
        ]
      : tokens[0] === "gh" && tokens[1] === "pr" && tokens[2] === "review"
        ? ["-b", "--body", "-F", "--body-file", "-R", "--repo"]
        : [];
  for (let index = 1; index < tokens.length; index++) {
    if (tokens[index] === "--") break;
    if (valued.includes(tokens[index])) index++;
    else if (tokens[index] === flag) return true;
  }
  return false;
}

/**
 * @param {string} command Full command line as the agent proposed it.
 * @param {ReadonlyArray<{ id: string, decision: string, command: string, flag?: string, reason: string, instead?: string }>} rules
 * @param {"bash" | "powershell"} [shell]
 * @returns {{ id: string, decision: string, command: string, flag?: string, reason: string, instead?: string } | null}
 */
export function matchGuardedCommand(command, rules, shell = "bash") {
  if (typeof command !== "string" || command.trim() === "") {
    return null;
  }

  const segments = scanCommands(
    shell === "bash" ? stripHeredocBodies(command) : command,
    shell
  ).map((segment) => normalizeCommand(segment.tokens));

  for (const decision of GUARD_DECISIONS) {
    for (const rule of rules) {
      if (rule.decision !== decision) {
        continue;
      }
      for (const segment of segments) {
        if (!rule.command.split(/\s+/).every((word, index) => segment[index] === word)) {
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
