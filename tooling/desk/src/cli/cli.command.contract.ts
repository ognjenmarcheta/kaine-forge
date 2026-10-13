import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse, parseIssueNumber } from "./cli.args";
import { UsageError, type CliCommand } from "./cli.types";
import { formatContract, parseContract } from "../github/github.contract";

const USAGE = "Usage: pnpm desk contract <issue> | --file <path> [--json]";

/**
 * How intake reads an issue body: the contract score, the missing sections, and the number of
 * acceptance criteria. It reads a file or a GitHub issue and changes nothing. The body itself is
 * never printed: it is untrusted text. Exit 0 only for a full contract with criteria.
 */
export const commandContract: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    file: { type: "string" },
    json: { type: "boolean" }
  });
  if ((values.file === undefined) === (positionals.length !== 1) || positionals.length > 1) {
    throw new UsageError(USAGE);
  }
  const body =
    values.file === undefined
      ? (await deps.createGitHub(deps.cwd).fetchIssue(parseIssueNumber(positionals[0]))).body
      : await readFile(path.resolve(deps.cwd, values.file), "utf8");

  const report = parseContract(body);
  const criteria = report.acceptanceCriteria.length;
  const ready = report.found === report.total && criteria > 0;
  if (values.json === true) {
    io.out(
      `${JSON.stringify({ found: report.found, total: report.total, missing: report.missing, acceptanceCriteria: criteria, ready }, null, 2)}\n`
    );
  } else {
    io.out(
      [
        formatContract(report),
        `acceptance criteria: ${criteria}`,
        ready
          ? "Intake reads the full contract."
          : criteria === 0
            ? "Intake stops: no acceptance criteria. See docs/agents/issue-format.md."
            : "Intake runs, but the contract is incomplete. See docs/agents/issue-format.md."
      ].join("\n") + "\n"
    );
  }
  return ready ? 0 : 1;
};
