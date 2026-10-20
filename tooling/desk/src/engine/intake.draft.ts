import { INTAKE_FIT_FILE, bodyHash, renderTicket } from "./intake.run";
import { runAgentStage } from "./pipeline.agent";
import { ARTIFACTS, writeArtifactJson, writeArtifactText } from "./pipeline.artifacts";
import type { StageContext } from "./pipeline.types";
import {
  intakeFitRecordSchema,
  intakeOutputSchema,
  issueDraftSchema,
  type IntakeFitRecord,
  type IssueDraft
} from "../contracts";
import { parseContract } from "../github/github.contract";
import { renderIssueBody } from "../github/github.format";
import type { IssueSnapshot } from "../github/github.types";

/**
 * The intake draft: for an issue that stopped at intake, the read-only intake agent sorts the
 * author's facts into the six sections of `docs/agents/issue-format.md`, and the engine renders
 * the new body. It runs in the main checkout, because no worktree exists before setup, with the
 * same invariants as every agent stage. It writes only `issue-draft.json`, `intake-fit.json` (the
 * fit score, which outlives the draft), and `ticket.md` (the fenced issue text the agent reads).
 * It never writes to GitHub.
 */

export type DraftOutcome =
  | { readonly ok: true; readonly draft: IssueDraft }
  | { readonly ok: false; readonly reason: string; readonly aborted: boolean };

export const ISSUE_DRAFT_FILE = "issue-draft.json";

export const draftIssueFormat = async (
  context: StageContext,
  input: { readonly snapshot: IssueSnapshot; readonly owner: string }
): Promise<DraftOutcome> => {
  const { deps } = context;
  const { snapshot } = input;
  const fail = (reason: string): DraftOutcome => ({ ok: false, reason, aborted: false });

  const head = await deps.exec({
    argv: ["git", "rev-parse", "HEAD"],
    cwd: deps.location.repoRoot,
    timeoutMs: 15_000
  });
  if (head.code !== 0) return fail(`Cannot read HEAD of the checkout: ${head.stderr.trim()}`);

  await writeArtifactText(
    context.artifactsDir,
    ARTIFACTS.ticket,
    renderTicket(snapshot, input.owner, parseContract(snapshot.body))
  );
  const run = await runAgentStage(context, {
    role: "intake",
    schema: intakeOutputSchema,
    readOnly: true,
    checkout: { path: deps.location.repoRoot, base: head.stdout.trim() }
  });
  if (!run.ok) return run;

  const output = run.result.structured;
  if (output.draft.acceptanceCriteria.length === 0) {
    const questions = output.unknowns.map((unknown) => `- ${unknown.question}`).join("\n");
    return fail(
      `The issue has no acceptance criteria the agent could support. Only the author can add them.${questions === "" ? "" : `\n${questions}`}`
    );
  }

  const body = renderIssueBody(output.draft, snapshot.body);
  const contract = parseContract(body);
  const draft = issueDraftSchema.parse({
    schema: 1,
    issue: snapshot.number,
    createdAt: deps.clock.now().toISOString(),
    originalBodyHash: bodyHash(snapshot.body),
    body,
    contract: { found: contract.found, total: contract.total },
    acceptanceCriteria: contract.acceptanceCriteria.length,
    recommendation: output.recommendation,
    reasons: output.reasons,
    fit: output.fit,
    unknowns: output.unknowns,
    plainLanguage: output.plainLanguage,
    provider: deps.config.providers.intake,
    model: deps.config.models.intake ?? null
  } satisfies IssueDraft);
  await writeArtifactJson(context.artifactsDir, ISSUE_DRAFT_FILE, draft);
  await writeArtifactJson(
    context.artifactsDir,
    INTAKE_FIT_FILE,
    intakeFitRecordSchema.parse({
      schema: 1,
      issue: snapshot.number,
      createdAt: draft.createdAt,
      originalBodyHash: draft.originalBodyHash,
      draftBodyHash: bodyHash(body),
      fit: output.fit
    } satisfies IntakeFitRecord)
  );
  return { ok: true, draft };
};
