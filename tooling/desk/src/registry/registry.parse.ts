import { parse } from "yaml";
import type { z } from "zod";

import {
  agentDefinitionSchema,
  flowDefinitionSchema,
  type AgentDefinition,
  type FlowDefinition
} from "../contracts";

/**
 * Text of an agent file (`<id>.md`) or a flow file (`<id>.yaml`) to a typed
 * definition. Parsing checks the shape only; `validateAgent` and
 * `validateFlow` check references and order. Errors are returned, never thrown.
 */

export type ParseResult<T> =
  | { readonly ok: true; readonly definition: T }
  | { readonly ok: false; readonly errors: readonly string[] };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const readYaml = (
  text: string
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string } => {
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One line per issue. An issue inside a step names the step by its id when it has one. */
const issueLines = (issues: z.ZodError["issues"], raw: Record<string, unknown>): string[] =>
  issues.map((issue) => {
    const [head, index, ...rest] = issue.path;
    const steps: unknown = raw["steps"];
    const step: unknown =
      head === "steps" && typeof index === "number" && Array.isArray(steps)
        ? steps[index]
        : undefined;
    const stepId = isRecord(step) && typeof step["id"] === "string" ? step["id"] : undefined;
    const where =
      stepId === undefined
        ? issue.path.map(String).join(".")
        : `step '${stepId}'${rest.length === 0 ? "" : ` ${rest.map(String).join(".")}`}`;
    return where === "" ? issue.message : `${where}: ${issue.message}`;
  });

export const parseAgentFile = (text: string): ParseResult<AgentDefinition> => {
  const match = FRONTMATTER.exec(text);
  if (match === null)
    return { ok: false, errors: ["The file needs YAML frontmatter between --- lines"] };
  const front = readYaml(match[1] ?? "");
  if (!front.ok) return { ok: false, errors: [front.error] };
  if (!isRecord(front.value)) return { ok: false, errors: ["The frontmatter must be a mapping"] };

  const raw = {
    ...front.value,
    prompt: text.slice(match[0].length).replaceAll("\r\n", "\n").trim()
  };
  const parsed = agentDefinitionSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, definition: parsed.data }
    : { ok: false, errors: issueLines(parsed.error.issues, raw) };
};

export const parseFlowFile = (text: string): ParseResult<FlowDefinition> => {
  const document = readYaml(text);
  if (!document.ok) return { ok: false, errors: [document.error] };
  if (!isRecord(document.value)) return { ok: false, errors: ["The flow must be a mapping"] };

  const parsed = flowDefinitionSchema.safeParse(document.value);
  return parsed.success
    ? { ok: true, definition: parsed.data }
    : { ok: false, errors: issueLines(parsed.error.issues, document.value) };
};
