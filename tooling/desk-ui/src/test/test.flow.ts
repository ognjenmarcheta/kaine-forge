import { flowStepViewsOf, type FlowDefinitionView, type FlowSnapshot } from "@repo/desk/contracts";

/**
 * The built-in default flow as an issue snapshot, for page tests. The steps and limits are
 * those of `kaine-default`; the agent prompts are short stand-ins, since no page shows them.
 */

const agent = (
  id: string,
  name: string,
  output: "plan" | "change" | "review" | "report",
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
  steps: flowStepViewsOf(snapshot)
});

/**
 * A repository flow of five steps that reuses built-in agents under the owner's own labels: a
 * plan step labelled "Sketch" (its id is a built-in one), a plan gate, a build, a check, and a
 * sign-off gate that is neither a plan gate nor a ship gate.
 */
export const CUSTOM_FLOW_SNAPSHOT: FlowSnapshot = {
  flow: {
    id: "quick-fix",
    name: "Quick fix",
    description: "Sketch, approve, implement, verify, and sign off.",
    steps: [
      { id: "plan", kind: "agent", label: "Sketch", agent: "planner" },
      { id: "approve", kind: "gate", label: "Approve the sketch", sendBack: ["plan"] },
      { id: "implement", kind: "agent", label: "Implement", agent: "builder" },
      {
        id: "verify",
        kind: "check",
        label: "Verify",
        commands: "loop",
        loopBack: { to: "implement", limit: 2 }
      },
      { id: "signoff", kind: "gate", label: "Sign off", sendBack: ["plan", "implement"] }
    ]
  },
  agents: DEFAULT_FLOW_SNAPSHOT.agents.filter((entry) => entry.id !== "reviewer"),
  hash: "1".repeat(64),
  flowSource: "repo"
};

/**
 * A repository research flow that changes nothing: a plan, its approval, then two report agents.
 * The editor's report, the last one, is the flow's result.
 */
export const RESEARCH_FLOW_SNAPSHOT: FlowSnapshot = {
  flow: {
    id: "research",
    name: "Research",
    description: "Plan, approve, research, and summarize.",
    steps: [
      { id: "plan", kind: "agent", label: "Plan", agent: "planner" },
      { id: "plan-gate", kind: "gate", label: "Approve the plan", sendBack: ["plan"] },
      { id: "research", kind: "agent", label: "Research", agent: "researcher" },
      { id: "summarize", kind: "agent", label: "Summarize", agent: "editor" }
    ]
  },
  agents: [
    agent("planner", "Planner", "plan", "claude"),
    agent("researcher", "Researcher", "report", "claude"),
    agent("editor", "Editor", "report", "claude")
  ],
  hash: "2".repeat(64),
  flowSource: "repo"
};
