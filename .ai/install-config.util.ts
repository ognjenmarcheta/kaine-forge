import { isDeepStrictEqual } from "node:util";
import { parse, stringify } from "smol-toml";
import { z } from "zod";

type ConfigValue = z.infer<ReturnType<typeof z.json>>;
const legacySerenaHook = {
  hooks: [
    {
      type: "command",
      command:
        "uvx --from git+https://github.com/oraios/serena serena prompts print-cc-system-prompt-override || echo 'warning: serena prompt unavailable, run pnpm ai:doctor'"
    }
  ]
};
const objectSchema = z.record(z.string(), z.json());
const isObject = (value: ConfigValue): value is Record<string, ConfigValue> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Exact historical output only. Changes to current generated hooks must retain
// the replaced definition here if installation needs to migrate it.
const legacyHooks: Record<string, ConfigValue[]> = {
  SessionStart: [legacySerenaHook],
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command:
            'node "$(git rev-parse --show-toplevel)/.ai/hooks/pre-tool-use.mjs" --agent claude',
          timeout: 10
        }
      ]
    }
  ]
};

function preservePersonalHooks(
  event: string,
  before: ConfigValue[],
  generated: ConfigValue[],
  warn?: (message: string) => void
): ConfigValue[] {
  const known = [...generated, ...(legacyHooks[event] ?? [])];
  const attributes = (group: Record<string, ConfigValue>) =>
    Object.fromEntries(Object.entries(group).filter(([key]) => key !== "hooks"));
  return before.flatMap((entry, index) => {
    if (known.some((definition) => isDeepStrictEqual(entry, definition))) return [];
    let preserved = entry;
    if (isObject(entry) && Array.isArray(entry.hooks)) {
      const ownedHandlers = known.flatMap((definition) =>
        isObject(definition) &&
        Array.isArray(definition.hooks) &&
        isDeepStrictEqual(attributes(entry), attributes(definition))
          ? definition.hooks
          : []
      );
      const remaining = entry.hooks.filter(
        (handler) => !ownedHandlers.some((owned) => isDeepStrictEqual(handler, owned))
      );
      if (remaining.length !== entry.hooks.length) {
        if (!remaining.length) return [];
        preserved = { ...entry, hooks: remaining };
      }
    }
    const text = JSON.stringify(preserved);
    if (
      text.includes(".ai/hooks/") ||
      text.includes("serena prompts print-cc-system-prompt-override")
    ) {
      warn?.(`Preserved unrecognized hook in ${event}[${index}]; review ownership manually.`);
    }
    return [preserved];
  });
}

/** Preserve personal settings; regenerate repository-owned hook entries and selected MCPs. */
export function mergeInstalledConfig(
  previous: string,
  generated: string,
  toml: boolean,
  managedMcps: string[],
  warn?: (message: string) => void
): string {
  const decode = (content: string) =>
    objectSchema.parse(toml ? parse(content) : JSON.parse(content));
  const old = decode(previous);
  const next = decode(generated);
  // Empty generated TOML has no server table. Explicitly remove unselected managed servers.
  for (const key of ["mcpServers", "mcp_servers", "mcp"]) {
    if (old[key] && !(key in next)) next[key] = {};
  }
  const merge = (
    left: Record<string, ConfigValue>,
    right: Record<string, ConfigValue>,
    parent = ""
  ): Record<string, ConfigValue> => {
    const result = { ...left };
    for (const [key, value] of Object.entries(right)) {
      const before = left[key];
      if (["mcpServers", "mcp_servers", "mcp"].includes(key) && isObject(value)) {
        const personal =
          before && isObject(before)
            ? Object.fromEntries(
                Object.entries(before).filter(([name]) => !managedMcps.includes(name))
              )
            : {};
        result[key] = {
          ...personal,
          ...Object.fromEntries(
            Object.entries(value).map(([name, server]) => {
              const previousServer = before && isObject(before) ? before[name] : undefined;
              if (!previousServer || !isObject(previousServer) || !isObject(server))
                return [name, server];
              const merged = merge(previousServer, server);
              // Activation is a personal choice, even when the renderer supplies a default.
              if (typeof previousServer.enabled === "boolean")
                merged.enabled = previousServer.enabled;
              return [name, merged];
            })
          )
        };
      } else if (Array.isArray(value) && Array.isArray(before) && parent === "hooks") {
        result[key] = [...preservePersonalHooks(key, before, value, warn), ...value];
      } else if (isObject(value) && before && isObject(before))
        result[key] = merge(before, value, key);
      else result[key] = value;
    }
    return result;
  };
  const result = merge(old, next);
  return toml
    ? `# GENERATED FILE. Repository sections managed by pnpm ai:install\n${stringify(result)}`
    : `${JSON.stringify(result, null, 2)}\n`;
}

/** Compare only managed values while allowing personal fields and hook entries. */
export function managedConfigMatches(previous: string, generated: string, toml = false): boolean {
  try {
    const decode = (content: string) =>
      objectSchema.parse(toml ? parse(content) : JSON.parse(content));
    return isDeepStrictEqual(
      decode(previous),
      decode(mergeInstalledConfig(previous, generated, toml, []))
    );
  } catch {
    return false;
  }
}
