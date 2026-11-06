#!/usr/bin/env tsx

import chalk from "chalk";
import { readFileSync, writeFileSync } from "node:fs";

import { LEDGER_PATH, parseLedger, rewriteLedger } from "./scorecard.util";

const main = (): void => {
  const raw = readFileSync(LEDGER_PATH, "utf8");
  const data = parseLedger(raw);

  const updated = rewriteLedger(raw, data);
  if (updated !== raw) {
    writeFileSync(LEDGER_PATH, updated);
    console.log(chalk.green(`Ledger generated region updated: ${LEDGER_PATH}`));
  } else {
    console.log(chalk.green("Ledger generated region is up to date."));
  }
  console.log(chalk.gray(`Runs: ${data.runs.length}`));
  console.log(chalk.gray("See it in the agent desk: pnpm desk:run, then open Scorecard."));
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exit(1);
}
