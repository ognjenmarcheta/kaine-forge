import { homedir } from "node:os";

import { parse } from "./cli.args";
import { dockerIsolationFor } from "./cli.runtime";
import { UsageError, type CliCommand } from "./cli.types";
import { loadDeskConfig, type DeskConfigLoadResult } from "../config/config.load";
import { formatDoctorReport, runDoctor, type DoctorCheck } from "../doctor/doctor.checks";
import { LABEL_DEFINITIONS, labelSyncCommands } from "../github/github.labels";
import { dockerDoctorChecks } from "../isolation/docker.doctor";
import { runIsolationProbes } from "../isolation/docker.probe";
import { configPath, resolveRepoLocation } from "../store/store.root";

/** Repository-level commands that touch no issue: `labels sync` and `doctor`. */

export const commandLabels: CliCommand = async (args, deps, io) => {
  const [sub, ...rest] = args;
  if (sub !== "sync") throw new UsageError("Usage: pnpm desk labels sync [--apply]");
  const { values, positionals } = parse(rest, { apply: { type: "boolean" } });
  if (positionals.length > 0) throw new UsageError("Usage: pnpm desk labels sync [--apply]");

  const commands = labelSyncCommands();
  if (values.apply !== true) {
    io.out(
      [
        "Dry run. These commands create or update the agent labels:",
        ...commands.map((command) => `  ${command}`),
        "",
        "Run `pnpm desk labels sync --apply` to run them.",
        ""
      ].join("\n")
    );
    return 0;
  }

  const github = deps.createGitHub(deps.cwd);
  const out: string[] = [];
  let failed = 0;
  for (const definition of LABEL_DEFINITIONS) {
    try {
      await github.createLabel(definition);
      out.push(`ok ${definition.name}`);
    } catch (error) {
      failed += 1;
      out.push(
        `failed ${definition.name}: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }
  io.out(`${out.join("\n")}\n`);
  return failed === 0 ? 0 : 1;
};

export const commandDoctor: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    json: { type: "boolean" },
    probe: { type: "boolean" }
  });
  if (positionals.length > 0) throw new UsageError("Usage: pnpm desk doctor [--json] [--probe]");

  let loadConfig = (): Promise<DeskConfigLoadResult> => loadDeskConfig();
  let dockerChecks: ((required: boolean) => Promise<DoctorCheck[]>) | undefined;
  try {
    const location = await resolveRepoLocation(deps.exec, deps.cwd);
    const { repoRoot } = location;
    loadConfig = () => loadDeskConfig(configPath(repoRoot));
    const loaded = await loadConfig();
    const isolation = loaded.ok ? dockerIsolationFor(deps, location, loaded.config) : undefined;
    if (isolation !== undefined && deps.docker !== undefined) {
      const dockerExec = deps.docker.exec;
      dockerChecks = async (required) =>
        dockerDoctorChecks({
          docker: isolation.docker,
          exec: dockerExec,
          imageTag: await isolation.imageTag(),
          required,
          probe:
            values.probe === true
              ? async () =>
                  runIsolationProbes(await isolation.machineContext(), [homedir(), repoRoot])
              : null
        });
    }
  } catch {
    // Outside a repository the git checks report the problem; config falls back to defaults.
  }
  const report = await runDoctor({
    exec: deps.exec,
    github: deps.createGitHub(deps.cwd),
    cwd: deps.cwd,
    nodeVersion: deps.nodeVersion,
    loadConfig,
    dockerChecks
  });
  io.out(
    `${values.json === true ? JSON.stringify(report, null, 2) : formatDoctorReport(report)}\n`
  );
  return report.ok ? 0 : 1;
};
