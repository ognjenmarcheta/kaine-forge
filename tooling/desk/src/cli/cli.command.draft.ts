import { parse, requireIssue } from "./cli.args";
import { describeResult } from "./cli.format";
import { openRuntime } from "./cli.runtime";
import { UsageError, type CliCommand } from "./cli.types";
import { fitConfidence, type IntakeFit, type IssueDraft } from "../contracts";
import type { PipelineResult } from "../engine/pipeline.types";

const USAGE = "pnpm desk draft <issue> [--snapshot-file <path>] | --apply [--confirm] [--json]";

/** 3 is the best fit on every axis: for complexity it means low complexity. */
const describeFit = (fit: IntakeFit): string[] => [
  `Fit confidence: ${fitConfidence(fit)}/3${fitConfidence(fit) === 1 ? " ('start' warns)" : ""}`,
  `  - clarity ${fit.clarity.score}/3: ${fit.clarity.reason}`,
  `  - low complexity ${fit.complexity.score}/3: ${fit.complexity.reason}`,
  `  - verifiability ${fit.verifiability.score}/3: ${fit.verifiability.reason}`
];

const describeDraft = (issue: number, draft: IssueDraft): string =>
  [
    `#${issue}: draft ready (contract ${draft.contract.found}/${draft.contract.total}, ${draft.acceptanceCriteria} acceptance criteria).`,
    `Recommendation: ${draft.recommendation}`,
    ...draft.reasons.map((reason) => `  - ${reason}`),
    ...(draft.fit === undefined ? [] : describeFit(draft.fit)),
    ...(draft.unknowns.length === 0
      ? []
      : ["Unknown:", ...draft.unknowns.map((entry) => `  - ${entry.section}: ${entry.question}`)]),
    "",
    "Proposed body:",
    "",
    draft.body,
    `Nothing was written to GitHub. Apply it with: pnpm desk draft ${issue} --apply. Then run 'start' again.`
  ].join("\n");

/**
 * `desk draft <n>`: for an issue that stopped at intake, the read-only intake agent drafts the
 * issue format. It prints the proposed body and changes nothing on GitHub.
 * `desk draft <n> --apply`: replace the issue body on GitHub with that draft, after an explicit
 * yes (`--confirm`, or a prompt on a terminal). The issue then waits for `start` again.
 */
export const commandDraft: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    "snapshot-file": { type: "string" },
    apply: { type: "boolean" },
    confirm: { type: "boolean" },
    json: { type: "boolean" }
  });
  const issue = requireIssue(positionals, USAGE);
  const apply = values.apply === true;
  if (!apply && values.confirm === true) {
    throw new UsageError(`--confirm goes with --apply. Usage: ${USAGE}`);
  }
  if (apply && values["snapshot-file"] !== undefined) {
    throw new UsageError(`A snapshot file cannot be applied to GitHub. Usage: ${USAGE}`);
  }
  const json = values.json === true;
  const opened = await openRuntime(deps, io, {
    json,
    persistLog: true,
    // A draft writes nothing to GitHub. The apply must: the issue's own no-writeback mark still holds.
    noWriteback: !apply,
    issue,
    recover: true
  });
  if (!opened.ok) {
    io.err(`${opened.message}\n`);
    return 1;
  }
  const { runtime } = opened;
  const print = (result: PipelineResult): number => {
    const view = describeResult(issue, result);
    if (json) io.out(`${JSON.stringify(view.json, null, 2)}\n`);
    else if (view.toStderr) io.err(view.text);
    else io.out(view.text);
    // An applied draft stops at needs-you on purpose: the next step is 'start'.
    return apply && result.outcome === "stopped" ? 0 : view.code;
  };
  try {
    if (apply) {
      let confirm = values.confirm === true;
      if (!confirm && deps.ask !== undefined) {
        confirm = await deps.ask(`Replace the body of #${issue} on GitHub with the draft? [y/N] `);
      }
      return print(await runtime.runner.applyDraft(issue, { confirm }));
    }
    const result = await runtime.runner.draft(issue, {
      snapshotFile: values["snapshot-file"]
    });
    if (result.outcome === "drafted") {
      if (json) io.out(`${JSON.stringify(result.draft, null, 2)}\n`);
      else io.out(`${describeDraft(issue, result.draft)}\n`);
      return 0;
    }
    return print(result);
  } finally {
    await runtime.settle();
  }
};
