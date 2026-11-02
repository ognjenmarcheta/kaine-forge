import type { Provider } from "../contracts";

/** A path that is safe to paste after `cd`. */
const shellQuote = (value: string): string =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;

/** The interactive CLI command that continues an agent session. */
const resumeCommand = (provider: Provider, sessionId: string): string => {
  switch (provider) {
    case "claude":
      return `claude --resume ${sessionId}`;
    case "codex":
      return `codex resume ${sessionId}`;
    case "opencode":
      return `opencode --session ${sessionId}`;
  }
};

/** What `desk resume` prints for one session: change to the worktree, then resume there. */
export const resumeLine = (provider: Provider, worktree: string, sessionId: string): string =>
  `cd ${shellQuote(worktree)} && ${resumeCommand(provider, sessionId)}`;
