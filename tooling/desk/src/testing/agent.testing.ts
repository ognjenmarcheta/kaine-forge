import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  NO_USAGE,
  type AgentDenial,
  type AgentEvent,
  type AgentRunRequest,
  type AgentRunResult
} from "../agents/agent.runner";

/** Helpers shared by the agent tests. */

export const probeOutputSchema = z.object({ word: z.string(), overrideSeen: z.boolean() }).strict();
export type ProbeOutput = z.infer<typeof probeOutputSchema>;

export const requestFor = <T>(
  parse: z.ZodType<T>,
  overrides: Partial<AgentRunRequest<T>> = {}
): AgentRunRequest<T> => ({
  role: "builder",
  provider: "claude",
  prompt: "Do the task.",
  outputSchema: z.toJSONSchema(parse, { target: "draft-7", io: "output" }),
  parse,
  cwd: "/work/repo",
  permissions: { allow: [], disallow: [] },
  timeoutMs: 60_000,
  skills: [],
  skillMode: "inline",
  ...overrides
});

export const baseRequest = (
  overrides: Partial<AgentRunRequest<ProbeOutput>> = {}
): AgentRunRequest<ProbeOutput> => requestFor(probeOutputSchema, overrides);

export const resultFor = <T>(
  structured: T,
  trace: readonly AgentEvent[] = [],
  denials: readonly AgentDenial[] = []
): AgentRunResult<T> => ({
  structured,
  sessionId: "session",
  usage: NO_USAGE,
  denials,
  trace,
  resultText: JSON.stringify(structured)
});

/** The lines of a recorded provider stream in `src/agents/__fixtures__`. */
export const fixtureLines = (name: string): string[] =>
  readFileSync(fileURLToPath(new URL(`../agents/__fixtures__/${name}`, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
