import { z } from "zod";

/** A parsed JSON document. Provider streams are parsed into this before anything else reads them. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);

/** Parse one line of JSON, or `undefined` when it is not valid JSON. */
export const parseJsonLine = (line: string): JsonValue | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  const parsed = jsonValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export const OUTPUT_PREVIEW_LIMIT = 600;

export const preview = (text: string, limit = OUTPUT_PREVIEW_LIMIT): string =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;

const FENCED_JSON = /```(?:json)?\s*([\s\S]*?)```/;

/**
 * The JSON document in an agent's final text: the whole text, or the first
 * fenced block. Used only when a provider did not return structured output.
 */
export const jsonFromText = (text: string): JsonValue | undefined => {
  const direct = parseJsonLine(text.trim());
  if (direct !== undefined) return direct;
  const fenced = FENCED_JSON.exec(text)?.[1];
  return fenced === undefined ? undefined : parseJsonLine(fenced.trim());
};
