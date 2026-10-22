import type { FlowDefinitionView, FlowSnapshot } from "@repo/desk/contracts";

/**
 * The built-in default flow as an issue snapshot, for page tests. The steps and limits are
 * those of `kaine-default`; the agent prompts are short stand-ins, since no page shows them.
 */

const agent = (
  id: string,
  name: string,
  output: "plan" | "change" | "review",
  provider: "claude" | "codex"
): FlowSnapshot["agents"][number] => ({
  id,
  name,
  description: name,
  provider,
  output,
  capabilities: {
    preset: output === "change" ? "edit-code" : "read-only",
    mcp: ["serena", "context7"],
    skills: []
  },
  prompt: `# Agent Desk ${id}`
});

export const DEFAULT_FLOW_SNAPSHOT: FlowSnapshot = {
  flow: {
    id: "kaine-default",
    name: "Kaine default",
    description: "Plan, build, check, review, and ship a draft PR.",
    steps: [
      { id: "plan", kind: "agent", label: "Plan", agent: "planner" },
      { id: "plan-gate", kind: "gate", label: "Approve the plan", sendBack: ["plan"] },
      { id: "build", kind: "agent", label: "Build", agent: "builder" },
      {
        id: "check",
        kind: "check",
        label: "Check",
        commands: "loop",
        loopBack: { to: "build", limit: 3, stopOnSameFailure: true }
      },
      {
        id: "review",
        kind: "agent",
        label: "Review",
        agent: "reviewer",
        loopBack: { to: "build", limit: 2 }
      },
      {
        id: "pr-review",
        kind: "gate",
        label: "Approve the change",
        sendBack: ["plan", "build", "review"]
      },
      { id: "ship", kind: "ship", label: "Ship", auto: false },
      {
        id: "pr-open",
        kind: "pr-wait",
        label: "Pull request open",
        maxRounds: 3,
        backTo: "build"
      }
    ]
  },
  agents: [
    agent("planner", "Planner", "plan", "claude"),
    agent("builder", "Builder", "change", "claude"),
    agent("reviewer", "Reviewer", "review", "codex")
  ],
  hash: "0".repeat(64),
  flowSource: "builtin"
};

/** What the server sends as `IssueDetail.flowDefinition` for a snapshot. */
export const flowDefinitionOf = (snapshot: FlowSnapshot): FlowDefinitionView => ({
  id: snapshot.flow.id,
  name: snapshot.flow.name,
  hash: snapshot.hash,
  source: snapshot.flowSource,
  steps: snapshot.flow.steps.map((step) => {
    const found =
      step.kind === "agent" ? snapshot.agents.find((entry) => entry.id === step.agent) : undefined;
    return {
      id: step.id,
      label: step.label,
      kind: step.kind,
      agent: found === undefined ? null : { id: found.id, name: found.name, output: found.output }
    };
  })
});
