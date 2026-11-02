import type { AgentPermissions } from "./agent.runner";

/**
 * The desk's rule lists in OpenCode 2 form: an ordered `permissions` array where the
 * last matching rule wins. The first rule denies every action, so a tool the lists do
 * not grant is refused, like Claude's `dontAsk`. The allows follow, and the denies come
 * last so no allow can reopen them.
 *
 * Contract: https://opencode.ai/v2/docs/permissions/
 */

export type OpencodeEffect = "allow" | "deny";

export interface OpencodePermission {
  readonly action: string;
  readonly resource: string;
  readonly effect: OpencodeEffect;
}

const RULE = /^([A-Za-z]+)(?:\((.*)\))?$/;

/** Claude tool names and the OpenCode action each one controls. */
const ACTIONS: Readonly<Record<string, string>> = {
  Read: "read",
  Glob: "glob",
  Grep: "grep",
  Edit: "edit",
  Write: "edit",
  WebFetch: "webfetch",
  WebSearch: "websearch"
};

/**
 * One desk rule as OpenCode rules. `Bash(cmd:*)` is a prefix rule: OpenCode needs the bare
 * command and `cmd *`. MCP rules have no OpenCode form, because an OpenCode run loads no
 * MCP server.
 */
const translate = (rule: string, effect: OpencodeEffect): OpencodePermission[] => {
  const match = RULE.exec(rule);
  if (match === null) return [];
  const [, tool = "", argument] = match;
  if (tool === "Bash") {
    if (argument === undefined) return [{ action: "shell", resource: "*", effect }];
    const prefix = argument.endsWith(":*") ? argument.slice(0, -2) : null;
    return prefix === null
      ? [{ action: "shell", resource: argument, effect }]
      : [
          { action: "shell", resource: prefix, effect },
          { action: "shell", resource: `${prefix} *`, effect }
        ];
  }
  if (tool === "Skill") {
    const skill = argument?.startsWith("skill:") === true ? argument.slice("skill:".length) : null;
    return skill === null ? [] : [{ action: "skill", resource: skill, effect }];
  }
  const action = ACTIONS[tool];
  return action === undefined ? [] : [{ action, resource: argument ?? "*", effect }];
};

export const toOpencodePermissions = (
  permissions: AgentPermissions
): readonly OpencodePermission[] => [
  { action: "*", resource: "*", effect: "deny" },
  ...permissions.allow.flatMap((rule) => translate(rule, "allow")),
  ...permissions.disallow.flatMap((rule) => translate(rule, "deny"))
];
