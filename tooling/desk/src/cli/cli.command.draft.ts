import { parse, requireIssue } from "./cli.args";
import { describeResult } from "./cli.format";
import { openRuntime } from "./cli.runtime";
import type { CliCommand } from "./cli.types";
import type { IssueDraft } from "../contracts";

const USAGE = "pnpm desk draft <issue> [--snapshot-file <path>] [--json]";

const describeDraft = (issue: number, draft: IssueDraft): string =>
  [
    `#${issue}: draft ready (contract ${draft.contract.found}/${draft.contract.total}, ${draft.acceptanceCriteria} acceptance criteria).`,
    `Recommendation: ${draft.recommendation}`,
    ...draft.reasons.map((reason) => `  - ${reason}`),
    ...(draft.unknowns.length === 0
      ? []
      : ["Unknown:", ...draft.unknowns.map((entry) => `  - ${entry.section}: ${entry.question}`)]),
    "",
    "Proposed body:",
    "",
    draft.body,
    "Nothing was written to GitHub. Read the draft, then change the issue, and run 'start' again."
  ].join("\n");

/**
 * `desk draft <n>`: for an issue that stopped at intake, the read-only intake agent drafts the
 * issue format. It prints the proposed body and changes nothing on GitHub.
 */
export const commandDraft: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    "snapshot-file": { type: "string" },
    json: { type: "boolean" }
  });
  const issue = requireIssue(positionals, USAGE);
  const json = values.json === true;
  const opened = await openRuntime(deps, io, {
    json,
    persistLog: true,
    noWriteback: true,
    issue,
    recover: true
  });
  if (!opened.ok) {
    io.err(`${opened.message}\n`);
    return 1;
  }
  const { runtime } = opened;
  try {
    const result = await runtime.runner.draft(issue, {
      snapshotFile: values["snapshot-file"]
    });
    if (result.outcome === "drafted") {
      if (json) io.out(`${JSON.stringify(result.draft, null, 2)}\n`);
      else io.out(`${describeDraft(issue, result.draft)}\n`);
      return 0;
    }
    const view = describeResult(issue, result);
    if (json) io.out(`${JSON.stringify(view.json, null, 2)}\n`);
    else if (view.toStderr) io.err(view.text);
    else io.out(view.text);
    return view.code === 0 ? 1 : view.code;
  } finally {
    await runtime.settle();
  }
};
