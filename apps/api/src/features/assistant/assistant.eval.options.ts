import { parseArgs } from "node:util";
import { z } from "zod";

import { assistantEvalCases } from "./assistant.eval.data";

export const EVAL_LIMITS = {
  steps: 8,
  outputTokens: 2048,
  caseMs: 60_000,
  runMs: 900_000,
  retries: 0
} as const;
export const evalOptionsSchema = z
  .object({
    live: z.boolean(),
    provider: z.enum(["openai", "deepseek"]).optional(),
    model: z.string().trim().min(1).optional(),
    repeat: z.number().int().min(1).max(5),
    cases: z.array(z.string()).min(1)
  })
  .superRefine((value, ctx) => {
    if (value.live && (!value.provider || !value.model))
      ctx.addIssue({ code: "custom", message: "Live runs require --provider and --model" });
    if (value.cases.some((id) => !assistantEvalCases.some((entry) => entry.id === id)))
      ctx.addIssue({ code: "custom", message: "Unknown evaluation case" });
  });

export function parseEvalOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      live: { type: "boolean", default: false },
      provider: { type: "string" },
      model: { type: "string" },
      case: { type: "string", multiple: true },
      repeat: { type: "string", default: "1" }
    }
  });
  return evalOptionsSchema.parse({
    live: values.live,
    provider: values.provider,
    model: values.model,
    repeat: Number(values.repeat),
    cases: values.case ?? assistantEvalCases.map((entry) => entry.id)
  });
}

export function selectedCredential(
  provider: "openai" | "deepseek",
  env: NodeJS.ProcessEnv
): { name: string; value: string } {
  const name = provider === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY";
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; export it before an explicit live run`);
  return { name, value };
}
