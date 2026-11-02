import { describe, expect, it } from "vitest";

import { toOpencodePermissions } from "./opencode.permissions";

describe("toOpencodePermissions", () => {
  it("denies every action first, then allows the lists grant, then the denies win last", () => {
    expect(
      toOpencodePermissions({
        allow: [
          "Read",
          "Bash(git status:*)",
          "Edit",
          "Write",
          "Skill(skill:kaine-test)",
          "mcp__serena__find_symbol"
        ],
        disallow: [
          "Bash(gh:*)",
          "Bash(pnpm db:push)",
          "Bash(pnpm db:push *)",
          "Edit(.git/**)",
          "WebFetch"
        ]
      })
    ).toEqual([
      { action: "*", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "shell", resource: "git status", effect: "allow" },
      { action: "shell", resource: "git status *", effect: "allow" },
      { action: "edit", resource: "*", effect: "allow" },
      { action: "edit", resource: "*", effect: "allow" },
      { action: "skill", resource: "kaine-test", effect: "allow" },
      { action: "shell", resource: "gh", effect: "deny" },
      { action: "shell", resource: "gh *", effect: "deny" },
      { action: "shell", resource: "pnpm db:push", effect: "deny" },
      { action: "shell", resource: "pnpm db:push *", effect: "deny" },
      { action: "edit", resource: ".git/**", effect: "deny" },
      { action: "webfetch", resource: "*", effect: "deny" }
    ]);
  });
});
