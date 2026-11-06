import { describe, expect, it } from "vitest";

import type { AgentStageRole, Provider } from "../contracts";
import { chooseProvider, type ProviderChoiceInput } from "./provider.choose";

/** The desk's default preference per role, as the config sets it. */
const DEFAULTS: Readonly<Record<AgentStageRole, Provider>> = {
  intake: "claude",
  planner: "claude",
  builder: "claude",
  reviewer: "codex"
};

const choose = (
  role: AgentStageRole,
  usable: readonly Provider[],
  over: Partial<ProviderChoiceInput> = {}
) =>
  chooseProvider({
    role,
    name: role,
    preferred: DEFAULTS[role],
    model: undefined,
    usable: new Set(usable),
    writes: role === "builder",
    allowCodexBuilder: false,
    ...over
  });

const providerOf = (choice: ReturnType<typeof chooseProvider>): Provider | string =>
  choice.ok ? choice.provider : choice.reason;

const ROLES = ["intake", "planner", "builder", "reviewer"] as const;

describe("chooseProvider", () => {
  it("runs every role on Claude when only Claude is installed", () => {
    expect(ROLES.map((role) => providerOf(choose(role, ["claude"])))).toEqual([
      "claude",
      "claude",
      "claude",
      "claude"
    ]);
  });

  it("runs the read-only roles on Codex when only Codex is installed, and builds only with the opt-in", () => {
    expect(
      (["intake", "planner", "reviewer"] as const).map((role) =>
        providerOf(choose(role, ["codex"]))
      )
    ).toEqual(["codex", "codex", "codex"]);
    const refused = choose("builder", ["codex"]);
    expect(refused.ok).toBe(false);
    expect(providerOf(refused)).toContain("Allow Codex to build in Setup");
    expect(providerOf(choose("builder", ["codex"], { allowCodexBuilder: true }))).toBe("codex");
  });

  it("keeps the preference when both are installed: Claude builds and Codex reviews", () => {
    expect(ROLES.map((role) => providerOf(choose(role, ["claude", "codex"])))).toEqual([
      "claude",
      "claude",
      "claude",
      "codex"
    ]);
  });

  it("moves a missing provider to the best other one, drops its model, and says why", () => {
    const choice = choose("reviewer", ["claude", "opencode"], {
      model: "gpt-5.1-codex",
      builderProvider: "claude"
    });
    expect(choice).toEqual({
      ok: true,
      provider: "claude",
      model: undefined,
      note: "The reviewer ran on claude: codex is not installed or does not work."
    });
  });

  it("gives the reviewer a provider other than the builder's when it has a choice", () => {
    // The owner picked Claude Code for the reviewer, but only Codex and OpenCode run; OpenCode
    // has no model, so Codex reviews.
    const choice = choose("reviewer", ["codex", "opencode"], {
      preferred: "claude",
      builderProvider: "codex"
    });
    expect(providerOf(choice)).toBe("codex");
  });

  it("runs OpenCode only where it was picked with a model", () => {
    expect(
      providerOf(
        choose("planner", ["opencode"], {
          preferred: "opencode",
          model: "anthropic/claude-haiku-4-5"
        })
      )
    ).toBe("opencode");
    const noModel = choose("planner", ["opencode"]);
    expect(providerOf(noModel)).toContain("Set models.planner to provider/model");
  });

  it("stops only when no agent CLI can run the step", () => {
    expect(providerOf(choose("planner", []))).toContain(
      "no agent CLI works on this machine. Install Claude Code, Codex, or OpenCode"
    );
  });
});
