import { describe, expect, it } from "vitest";

import { formatWorktrunkStatusLine } from "./hooks/worktrunk-cli.mjs";

describe("formatWorktrunkStatusLine", () => {
  it.each([
    [
      "an absent CLI",
      null,
      "- Worktrunk: wt CLI not installed (optional; install: cargo install worktrunk --version 0.81.0)"
    ],
    [
      "the pinned CLI",
      "0.81.0",
      "- Worktrunk: wt 0.81.0 ready; new agent worktree: wt switch -c -x <agent> <branch>; never wt merge"
    ],
    [
      "another CLI version",
      "0.82.0",
      "- Worktrunk: wt 0.82.0 ready; new agent worktree: wt switch -c -x <agent> <branch>; never wt merge; wt 0.82.0 installed, repo pins 0.81.0 (cargo install worktrunk --version 0.81.0)"
    ]
  ])("reports %s", (_case, version, line) => {
    expect(formatWorktrunkStatusLine(version)).toBe(line);
  });
});
