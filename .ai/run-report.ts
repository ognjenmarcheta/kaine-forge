import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

import { codingRunSchema, summarizeCodingRuns, summarizeModelLogs } from "./run-report.util";

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args[0] === "outcome") {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        run: { type: "string" },
        outcome: { type: "string" },
        minutes: { type: "string" },
        note: { type: "string" }
      }
    });
    const input = z
      .object({
        run: z.string().min(1),
        outcome: z.enum(["accepted", "rework-required", "rejected"]),
        minutes: z.coerce.number().nonnegative().optional(),
        note: z.string().min(1)
      })
      .parse(values);
    const run = codingRunSchema.parse(JSON.parse(readFileSync(input.run, "utf8")));
    if (run.outcome !== null) throw new Error("Run already reviewed");
    writeFileSync(
      input.run,
      `${JSON.stringify({ ...run, outcome: input.outcome, reviewMinutes: input.minutes ?? null, note: input.note }, null, 2)}\n`
    );
    return;
  }
  const { values } = parseArgs({
    args,
    options: { logs: { type: "string" }, runs: { type: "string" } }
  });
  if (Boolean(values.logs) === Boolean(values.runs))
    throw new Error("Provide exactly one of --logs <jsonl> or --runs <directory>");
  if (values.logs)
    console.log(
      JSON.stringify(summarizeModelLogs(readFileSync(values.logs, "utf8").split(/\r?\n/)), null, 2)
    );
  if (values.runs) {
    const directory = values.runs;
    const runs = readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) =>
        codingRunSchema.parse(JSON.parse(readFileSync(path.join(directory, name), "utf8")))
      );
    console.log(JSON.stringify(summarizeCodingRuns(runs), null, 2));
  }
}
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Report failed");
  process.exitCode = 1;
}
