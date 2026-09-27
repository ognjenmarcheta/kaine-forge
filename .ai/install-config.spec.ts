import { parse, stringify } from "smol-toml";
import { expect, it } from "vitest";

import { renderClaudeSettings, renderCodexConfig } from "./ai.util";
import { managedConfigMatches, mergeInstalledConfig } from "./install-config.util";

const managed = {
  type: "command",
  command: 'node "$(git rev-parse --show-toplevel)/.ai/hooks/pre-tool-use.mjs" --agent claude',
  timeout: 10
};
const personal = { type: "command", command: "node tools/personal.mjs --watch .ai/hooks/" };

it("preserves personal references, mixed handlers and their order while migrating the Bash group", () => {
  const before = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [personal, managed, { type: "command", command: "last" }] },
        { matcher: "Edit", hooks: [personal] }
      ]
    }
  });
  const generated = renderClaudeSettings();
  const installed = mergeInstalledConfig(before, generated, false, []);
  expect(JSON.parse(installed).hooks.PreToolUse).toEqual([
    { matcher: "Bash", hooks: [personal, { type: "command", command: "last" }] },
    { matcher: "Edit", hooks: [personal] },
    { matcher: "^(Bash|PowerShell)$", hooks: [managed] }
  ]);
  expect(mergeInstalledConfig(installed, generated, false, [])).toBe(installed);
  expect(managedConfigMatches(installed, generated)).toBe(true);
});

it("ignores object key order for exact owned definitions", () => {
  const before = JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          hooks: [{ timeout: 10, command: managed.command, type: "command" }],
          matcher: "Bash"
        }
      ]
    }
  });
  expect(
    JSON.parse(mergeInstalledConfig(before, renderClaudeSettings(), false, [])).hooks.PreToolUse
  ).toEqual([{ matcher: "^(Bash|PowerShell)$", hooks: [managed] }]);
});

it("preserves modified group settings and handler settings", () => {
  const entries = [
    { matcher: "Bash", personalSetting: true, hooks: [managed] },
    { matcher: "Bash", hooks: [{ ...managed, timeout: 11 }] },
    { matcher: "Edit", hooks: [managed] }
  ];
  const before = JSON.stringify({ hooks: { PreToolUse: entries } });
  const warnings: string[] = [];
  const result = JSON.parse(
    mergeInstalledConfig(before, renderClaudeSettings(), false, [], (message) =>
      warnings.push(message)
    )
  );
  expect(result.hooks.PreToolUse.slice(0, 3)).toEqual(entries);
  expect(warnings).toHaveLength(3);
  expect(warnings.every((message) => message.includes("review ownership manually"))).toBe(true);
  expect(warnings.join("\n")).not.toContain(managed.command);
});

it("does not treat a known handler under a different event as owned", () => {
  const personalGroup = { matcher: "Bash", hooks: [managed] };
  const before = JSON.stringify({ hooks: { SessionStart: [personalGroup] } });
  expect(
    JSON.parse(mergeInstalledConfig(before, renderClaudeSettings(), false, [])).hooks
      .SessionStart[0]
  ).toEqual(personalGroup);
});

it("preserves personal TOML hook groups across idempotent regeneration", () => {
  const generated = renderCodexConfig({ mcpServers: {} });
  const before = `${generated}\n[[hooks.PreToolUse]]\nmatcher = "Bash"\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = "personal .ai/hooks/"\n`;
  const installed = mergeInstalledConfig(before, generated, true, []);
  const expected = parse(generated);
  expect(parse(installed)).toMatchObject({
    hooks: {
      PreToolUse: expect.arrayContaining([
        { matcher: "Bash", hooks: [{ type: "command", command: "personal .ai/hooks/" }] }
      ])
    }
  });
  expect(installed).toContain('command = "personal .ai/hooks/"');
  expect(mergeInstalledConfig(installed, stringify(expected), true, [])).toBe(installed);
  expect(managedConfigMatches(installed, generated, true)).toBe(true);
});
