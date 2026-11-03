import type { AgentStageRole, Provider } from "../contracts";

/**
 * The best provider first, by role. The reviewer leads with Codex so a review is a second opinion
 * on a Claude build. A role that changes code leads with Claude: the Codex sandbox is coarser
 * than a Claude allowlist (ADR 0011). OpenCode runs only where the owner picked it with a model.
 */
export const PROVIDER_RANKING: Readonly<Record<AgentStageRole, readonly Provider[]>> = {
  intake: ["claude", "codex", "opencode"],
  planner: ["claude", "codex", "opencode"],
  builder: ["claude", "opencode", "codex"],
  reviewer: ["codex", "claude", "opencode"]
};

export interface ProviderChoiceInput {
  readonly role: AgentStageRole;
  /** The name the history and the stop reason use: the agent id, or a job's name. */
  readonly name: string;
  /** What the config or the agent file asks for. */
  readonly preferred: Provider;
  /** The model for `preferred`. A model of one provider means nothing to another. */
  readonly model: string | undefined;
  readonly usable: ReadonlySet<Provider>;
  /** The run may change the checkout: a builder, a screen or component job. */
  readonly writes: boolean;
  readonly allowCodexBuilder: boolean;
  /** The provider that builds this issue. The reviewer avoids it when it has a choice. */
  readonly builderProvider?: Provider | undefined;
}

export type ProviderChoice =
  | {
      readonly ok: true;
      readonly provider: Provider;
      readonly model: string | undefined;
      /** Why the run left the provider it asked for. `null` when it got that provider. */
      readonly note: string | null;
    }
  | { readonly ok: false; readonly reason: string };

const CODEX_BUILDER_FIX =
  'Allow Codex to build in Setup, or set "allowCodexBuilder": true in .ai.local/desk/config.json.';

/** Why `provider` cannot run this step, or `null` when it can. */
const blocker = (input: ProviderChoiceInput, provider: Provider): string | null => {
  if (!input.usable.has(provider)) return `${provider} is not installed or does not work`;
  if (provider === "codex" && input.writes && !input.allowCodexBuilder) {
    return "Codex may not change code until you allow it";
  }
  // OpenCode has no default model, and the model of another provider does not fit it.
  if (provider === "opencode" && (provider !== input.preferred || input.model === undefined)) {
    return "OpenCode has no model for this step";
  }
  return null;
};

/**
 * The provider a run uses. It keeps the one it asked for when that one can run. Otherwise it
 * takes the best of the rest for the role, and never stops while any provider can run the step.
 */
export const chooseProvider = (input: ProviderChoiceInput): ProviderChoice => {
  const why = blocker(input, input.preferred);
  if (why === null) {
    return { ok: true, provider: input.preferred, model: input.model, note: null };
  }
  const candidates = PROVIDER_RANKING[input.role].filter(
    (provider) => provider !== input.preferred && blocker(input, provider) === null
  );
  const other = candidates.find((provider) => provider !== input.builderProvider);
  const provider = (input.role === "reviewer" ? other : undefined) ?? candidates[0];
  if (provider !== undefined) {
    return {
      ok: true,
      provider,
      model: undefined,
      note: `The ${input.name} ran on ${provider}: ${why}.`
    };
  }
  if (input.usable.size === 0) {
    return {
      ok: false,
      reason: `The ${input.name} cannot run: no agent CLI works on this machine. Install Claude Code, Codex, or OpenCode, then continue.`
    };
  }
  if (input.usable.has("codex") && input.writes && !input.allowCodexBuilder) {
    return {
      ok: false,
      reason: `The ${input.name} cannot run: Codex is the only agent CLI here, and it may not change code until you allow it. ${CODEX_BUILDER_FIX}`
    };
  }
  return {
    ok: false,
    reason: `The ${input.name} cannot run: ${why}, and no other agent CLI can take the step. Set models.${input.role} to provider/model for OpenCode, or install Claude Code or Codex.`
  };
};
