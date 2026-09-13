import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

import { EVAL_LIMITS, parseEvalOptions, selectedCredential } from "./assistant.eval.options";
import {
  evalReportStatus,
  readEvalReport,
  reviewEvalResult,
  writeEvalReport
} from "./assistant.eval.report";

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args[0] === "review") {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        report: { type: "string" },
        result: { type: "string" },
        truthful: { type: "string" },
        quality: { type: "string" },
        note: { type: "string" }
      }
    });
    const input = z
      .object({
        report: z.string().min(1),
        result: z.string().uuid(),
        truthful: z.enum(["pass", "fail"]),
        quality: z.enum(["pass", "fail"]),
        note: z.string().min(1)
      })
      .parse(values);
    const report = reviewEvalResult(readEvalReport(input.report), {
      resultId: input.result,
      truthful: input.truthful,
      quality: input.quality,
      note: input.note
    });
    writeEvalReport(input.report, report);
    console.log(evalReportStatus(report));
    if (evalReportStatus(report) === "fail" || evalReportStatus(report) === "incomplete")
      process.exitCode = 1;
    return;
  }
  const options = parseEvalOptions(args);
  console.log(`Selected ${options.cases.length} cases × ${options.repeat} repetitions`);
  console.log(options.cases.join("\n"));
  if (!options.live) {
    console.log("Preview only. No provider calls.");
    return;
  }
  if (!options.provider || !options.model) throw new Error("Live model selection missing");
  const credential = selectedCredential(options.provider, process.env);
  const apiRoot = path.resolve(import.meta.dirname, "../../..");
  const repoRoot = path.resolve(apiRoot, "../..");
  const reportPath = path.join(repoRoot, ".ai.local", "evals", "assistant", `${randomUUID()}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  // Do not inherit DATABASE_URL, NODE_OPTIONS, or unrelated provider credentials.
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE"
  ]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  Object.assign(env, {
    [credential.name]: credential.value,
    AI_ASSISTANT_PROVIDER: options.provider,
    AI_ASSISTANT_MODEL: options.model,
    KAINE_EVAL_OPTIONS: JSON.stringify(options),
    KAINE_EVAL_REPORT: reportPath
  });
  const child = spawn(
    process.execPath,
    [
      path.join(apiRoot, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vitest.eval.config.ts"
    ],
    { cwd: apiRoot, env, stdio: "inherit" }
  );
  const stop = () => {
    if (process.platform === "win32" && child.pid)
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
    else child.kill("SIGKILL");
  };
  const timer = setTimeout(stop, EVAL_LIMITS.runMs);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve(status ?? 1));
  }).finally(() => {
    clearTimeout(timer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  });
  // Opening the report also verifies that a killed child did not masquerade as a complete run.
  readFileSync(reportPath, "utf8");
  const status = evalReportStatus(readEvalReport(reportPath));
  console.log(`Report: ${reportPath}\nStatus: ${status}`);
  process.exitCode = code || (status === "fail" || status === "incomplete" ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
});
