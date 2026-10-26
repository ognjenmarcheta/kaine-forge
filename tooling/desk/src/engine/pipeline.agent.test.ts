import { describe, expect, it } from "vitest";

import { deskConfigSchema } from "../contracts";
import { agentProfileOf, type AgentProfile } from "./pipeline.agent";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";

/** The desk config moves the built-in reviewer to Claude; a flow agent of its own keeps Codex. */
const config = deskConfigSchema.parse({ providers: { reviewer: "claude" } });

const builtin = (id: string) => {
  const agent = DEFAULT_SNAPSHOT.agents.find((entry) => entry.id === id);
  if (agent === undefined) throw new Error(`the default flow has a ${id}`);
  return agent;
};
const writer = {
  ...builtin("reviewer"),
  id: "writer",
  output: "report",
  provider: "codex"
} as const;

describe("agentProfileOf", () => {
  const cases: readonly { readonly agent: string; readonly profile: AgentProfile }[] = [
    {
      agent: "planner",
      profile: {
        role: "planner",
        readOnly: true,
        resumes: true,
        provider: "claude",
        model: undefined
      }
    },
    {
      agent: "builder",
      profile: {
        role: "builder",
        readOnly: false,
        resumes: true,
        provider: "claude",
        model: undefined
      }
    },
    {
      agent: "reviewer",
      profile: {
        role: "reviewer",
        readOnly: true,
        resumes: false,
        provider: "claude",
        model: undefined
      }
    },
    {
      agent: "writer",
      profile: {
        role: "planner",
        readOnly: true,
        resumes: false,
        provider: "codex",
        model: undefined
      }
    }
  ];

  it.each(cases)("runs the $agent by what it produces", ({ agent, profile }) => {
    expect(agentProfileOf(config, agent === "writer" ? writer : builtin(agent))).toEqual(profile);
  });
});
