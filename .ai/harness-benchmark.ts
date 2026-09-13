import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

import { runCodingAgent } from "./agent-run";
import { commandEnvironment, controllerEnvironment, sandboxConfig } from "./agent-run.util";
import { REPO_ROOT } from "./ai.util";
import { benchmarkFixtures, seedBenchmark } from "./benchmark-fixtures";
import { runNativeProbe } from "./native-sandbox";

const caseSchema = z.enum(["query-key", "notes-deletion"]);
const preparedSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  case: caseSchema,
  revision: z.string(),
  cleanExit: z.literal(0),
  seededExit: z
    .number()
    .int()
    .refine((code) => code !== 0)
});
const root = path.join(REPO_ROOT, ".ai.local", "benchmarks");

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      prepare: { type: "boolean" },
      live: { type: "boolean" },
      case: { type: "string" },
      run: { type: "string" },
      model: { type: "string" }
    }
  });
  if (values.prepare && values.live)
    throw new Error("Prepare dependencies separately before --live");
  if (!values.prepare && !values.live) {
    console.log(
      `Manual capability fixtures: ${Object.keys(benchmarkFixtures).join(", ")}\nUse --prepare --case <id>, then --live --run <uuid> --model <model>.`
    );
    return;
  }
  const env = {
    ...commandEnvironment(process.env),
    TEMP: process.env["TEMP"],
    TMP: process.env["TMP"],
    DATABASE_URL: "postgresql://synthetic:synthetic@localhost:5432/benchmark-unused"
  };
  const verify = (directory: string, name: keyof typeof benchmarkFixtures, log: string) => {
    const fixture = benchmarkFixtures[name];
    const cwd = path.join(directory, fixture.workspace);
    const result = spawnSync(
      process.execPath,
      [path.join(cwd, "node_modules/vitest/vitest.mjs"), "run", ...fixture.tests],
      { cwd, env, encoding: "utf8", timeout: 120_000 }
    );
    writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    if (result.error || result.status === null)
      throw new Error("Independent verification did not complete");
    return result.status;
  };
  if (values.prepare) {
    const name = caseSchema.parse(values.case);
    const id = randomUUID();
    const directory = path.join(root, id);
    mkdirSync(directory, { recursive: true });
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }).trim();
    for (const role of ["trial", "verifier"]) {
      const checkout = path.join(directory, role);
      execFileSync("git", ["clone", "--no-hardlinks", "--local", REPO_ROOT, checkout], {
        stdio: "inherit"
      });
      execFileSync("git", ["checkout", "--detach", revision], { cwd: checkout, stdio: "inherit" });
      // Trusted preparation phase. No model runs and no sandbox boundary is claimed here.
      const pnpmCli = process.env["npm_execpath"];
      if (!pnpmCli) throw new Error("Invoke through pnpm harness:benchmark");
      const command = pnpmCli.endsWith(".exe") ? pnpmCli : process.execPath;
      const prefix = command === process.execPath ? [pnpmCli] : [];
      execFileSync(command, [...prefix, "install", "--frozen-lockfile", "--offline"], {
        cwd: checkout,
        env: controllerEnvironment(process.env, false),
        stdio: "inherit",
        timeout: 300_000
      });
      execFileSync(command, [...prefix, "ai:install", "--agent", "codex", "--non-interactive"], {
        cwd: checkout,
        env: controllerEnvironment(process.env, false),
        stdio: "inherit",
        timeout: 30_000
      });
    }
    const fixture = benchmarkFixtures[name];
    const trial = path.join(directory, "trial");
    const verifier = path.join(directory, "verifier");
    const cleanExit = verify(verifier, name, path.join(directory, "clean.log"));
    if (cleanExit !== 0) throw new Error("Clean behavioral control failed; inspect clean.log");
    const original = readFileSync(path.join(trial, fixture.target), "utf8");
    const seeded = seedBenchmark(original, name);
    writeFileSync(path.join(trial, fixture.target), seeded);
    writeFileSync(path.join(verifier, fixture.target), seeded);
    const seededExit = verify(verifier, name, path.join(directory, "seeded.log"));
    writeFileSync(path.join(verifier, fixture.target), original);
    const prepared = preparedSchema.parse({
      schemaVersion: 1,
      id,
      case: name,
      revision,
      cleanExit,
      seededExit
    });
    writeFileSync(path.join(directory, "prepared.json"), JSON.stringify(prepared, null, 2));
    writeFileSync(
      path.join(directory, "prompt.md"),
      `${fixture.prompt}\nUse the repository rules. Do not commit or publish. Report the checks you actually ran.\n`
    );
    console.log(`Prepared ${id}. Clean control passes; seeded defect fails. No model dispatched.`);
    return;
  }
  const id = z.string().uuid().parse(values.run);
  const model = z.string().trim().min(1).parse(values.model);
  const directory = path.join(root, id);
  const prepared = preparedSchema.parse(
    JSON.parse(readFileSync(path.join(directory, "prepared.json"), "utf8"))
  );
  const started = path.join(directory, "started.json");
  if (existsSync(started))
    throw new Error("Each fixture permits one fresh session. Prepare a new run for a repetition.");
  writeFileSync(started, JSON.stringify({ model, startedAt: new Date().toISOString() }), {
    flag: "wx"
  });
  const result = await runCodingAgent([
    "--workspace",
    path.join(directory, "trial"),
    "--prompt-file",
    path.join(directory, "prompt.md"),
    "--model",
    model,
    "--mode",
    "edit",
    "--save-transcript"
  ]);
  // The agent never sees or edits this checkout. Only its production repair is copied into it.
  const target = benchmarkFixtures[prepared.case].target;
  const trial = realpathSync(path.join(directory, "trial"));
  const candidate = realpathSync(path.join(trial, target));
  const relativeCandidate = path.relative(trial, candidate);
  if (relativeCandidate.startsWith("..") || path.isAbsolute(relativeCandidate))
    throw new Error("Candidate escapes its trial checkout");
  writeFileSync(path.join(directory, "verifier", target), readFileSync(candidate));
  // Candidate code is untrusted. The trusted preparation verifier above must never execute it.
  const verifier = path.join(directory, "verifier");
  const fixture = benchmarkFixtures[prepared.case];
  const temporary = mkdtempSync(path.join(tmpdir(), "kaine-verifier-"));
  const profileName = `kaine_verify_${id.replaceAll("-", "")}`;
  const config = sandboxConfig({
    profileName,
    temporary,
    outside: trial,
    mode: "edit",
    nodeDirectory: path.dirname(process.execPath),
    commandEnv: { ...commandEnvironment(process.env), DATABASE_URL: env.DATABASE_URL }
  });
  const cwd = path.join(verifier, fixture.workspace);
  let behaviorPassed = false;
  try {
    const output = await runNativeProbe({
      config,
      workspace: verifier,
      profileName,
      command: [
        process.execPath,
        path.join(cwd, "node_modules/vitest/vitest.mjs"),
        "run",
        "--root",
        cwd,
        ...fixture.tests
      ]
    });
    writeFileSync(path.join(directory, "verification.log"), output);
    behaviorPassed = true;
  } catch (error) {
    writeFileSync(
      path.join(directory, "verification.log"),
      error instanceof Error ? error.message : "Native verification failed"
    );
  }
  writeFileSync(
    path.join(directory, "result.json"),
    JSON.stringify(
      {
        ...prepared,
        codingRun: result.path,
        behaviorPassed,
        humanOutcome: "review-required"
      },
      null,
      2
    )
  );
  console.log(
    `Independent behavior: ${behaviorPassed ? "pass" : "fail"}; human review remains required. ${directory}`
  );
  process.exitCode = result.run.termination === "completed" && behaviorPassed ? 0 : 1;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Benchmark failed");
  process.exitCode = 1;
});
