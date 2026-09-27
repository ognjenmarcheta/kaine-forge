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

/** Preserve personal settings; regenerate repository-owned hook entries and selected MCPs. */
export function mergeInstalledConfig(
  previous: string,
  generated: string,
  toml: boolean,
  managedMcps: string[]
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
        result[key] = [
          ...before.filter(
            (entry) =>
              !JSON.stringify(entry).includes(".ai/hooks/") &&
              JSON.stringify(entry) !== JSON.stringify(legacySerenaHook) &&
              !value.some((expected) => JSON.stringify(expected) === JSON.stringify(entry))
          ),
          ...value
        ];
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
    const canonicalize = (value: ConfigValue): string => {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      if (isObject(value))
        return `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key] ?? null)}`)
          .join(",")}}`;
      return JSON.stringify(value);
    };
    return (
      canonicalize(decode(previous)) ===
      canonicalize(decode(mergeInstalledConfig(previous, generated, toml, [])))
    );
  } catch {
    return false;
  }
}
