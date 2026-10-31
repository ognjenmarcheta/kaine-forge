const KINDS = [
  "todoCreate",
  "todoUpdate",
  "todoDelete",
  "noteCreate",
  "noteUpdate",
  "noteDelete"
] as const;

function isKind(value: unknown): value is (typeof KINDS)[number] {
  return KINDS.some((kind) => kind === value);
}

export interface PushedMutation {
  kind:
    | "todoCreate"
    | "todoUpdate"
    | "todoDelete"
    | "noteCreate"
    | "noteUpdate"
    | "noteDelete"
    | "other";
  id: string;
  fields: Record<string, unknown>;
}
/** The mutations of a `SyncPush` request, each as its operation name and fields. */
export function pushedMutations(body: string): PushedMutation[] {
  const parsed: unknown = JSON.parse(body);
  const vars =
    parsed && typeof parsed === "object" && "variables" in parsed ? parsed.variables : null;
  const input = vars && typeof vars === "object" && "input" in vars ? vars.input : null;
  const list =
    input && typeof input === "object" && "mutations" in input && Array.isArray(input.mutations)
      ? input.mutations
      : [];
  return list.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const [kind, value] = Object.entries(entry)[0] ?? [];
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string")
      return [];
    const fields: Record<string, unknown> = { ...value };
    return [
      {
        kind: isKind(kind) ? kind : "other",
        id: value.id,
        fields
      }
    ];
  });
}

/** A text field of a pushed mutation, or null. */
export function textOf(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" ? value : null;
}
