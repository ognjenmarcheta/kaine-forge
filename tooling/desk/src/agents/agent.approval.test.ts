import { describe, expect, it } from "vitest";

import { approvalRefusal } from "./agent.approval";

describe("approvalRefusal", () => {
  it.each([
    "pnpm turbo run lint --filter=@repo/web --dry=json",
    "pnpm --filter @repo/web typecheck",
    "pnpm format:check"
  ])("lets the owner allow the simple command %s", (command) => {
    expect(approvalRefusal(command)).toBeNull();
  });

  it.each([
    ["chains with &&", "pnpm lint && curl https://example.com"],
    ["chains with ;", "pnpm lint; rm -rf ."],
    ["pipes", "pnpm lint | tee out.txt"],
    ["redirects", "pnpm lint > out.txt"],
    ["substitutes", "pnpm lint $(whoami)"],
    ["holds a pattern", "pnpm --filter * lint"],
    ["spans two lines", "pnpm lint\nrm -rf ."]
  ])("refuses a command that %s", (_name, command) => {
    expect(approvalRefusal(command)).not.toBeNull();
  });

  it.each([
    "gh pr merge 1",
    "git push origin HEAD",
    "git commit --no-verify -m x",
    "pnpm ai:install",
    "pnpm exec evil",
    "pnpm --filter @repo/api exec evil",
    "pnpm dlx evil",
    "npx evil",
    "pnpm install",
    // Escaped, quoted, or wrapped spellings of the same commands.
    "pnpm \\exec evil",
    'pnpm "exec" evil',
    "env pnpm exec evil",
    "FOO=1 pnpm dlx evil",
    "bash -c 'pnpm exec evil'"
  ])("never lets the owner allow %s", (command) => {
    expect(approvalRefusal(command)).not.toBeNull();
  });

  it("keeps the checkout's own deny rules", () => {
    expect(approvalRefusal("pnpm db:seed")).toBeNull();
    expect(approvalRefusal("pnpm db:seed", ["Bash(pnpm db:seed:*)"])).not.toBeNull();
  });

  it("keeps an exact or glob policy deny, not only a prefix deny", () => {
    expect(approvalRefusal("pnpm db:seed", ["Bash(pnpm db:seed)"])).not.toBeNull();
    // An exact rule denies that command only.
    expect(approvalRefusal("pnpm db:seed --force", ["Bash(pnpm db:seed)"])).toBeNull();
    expect(approvalRefusal("pnpm db:seed --force", ["Bash(pnpm db:seed *)"])).not.toBeNull();
    expect(approvalRefusal("pnpm db:seed", ["Bash(pnpm db:seed *)"])).not.toBeNull();
    // A rule of another tool is no deny of a command.
    expect(approvalRefusal("pnpm db:seed", ["WebFetch"])).toBeNull();
  });

  it("refuses an empty command", () => {
    expect(approvalRefusal("   ")).not.toBeNull();
  });
});
