#!/usr/bin/env tsx

import chalk from "chalk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  derivedFlows,
  GENERATED_MARKER,
  LEDGER_PATH,
  OUT_DIR,
  parseLedger,
  renderDashboardHtml,
  renderLedgerMarkdown,
  replaceRegion
} from "./scorecard.util";

const main = (): void => {
  const raw = readFileSync(LEDGER_PATH, "utf8");
  const data = parseLedger(raw);
  const flows = [...derivedFlows(), ...data.authoredFlows];

  const updated = replaceRegion(raw, GENERATED_MARKER, renderLedgerMarkdown(data));
  if (updated !== raw) {
    writeFileSync(LEDGER_PATH, updated);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = join(OUT_DIR, "index.html");
  writeFileSync(htmlPath, renderDashboardHtml(data, flows));

  console.log(chalk.green(`Scorecard rendered: ${htmlPath}`));
  console.log(chalk.gray(`Runs: ${data.runs.length} · Flows: ${flows.length}`));
  if (updated !== raw) {
    console.log(chalk.gray(`Ledger generated region updated: ${LEDGER_PATH}`));
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exit(1);
}
