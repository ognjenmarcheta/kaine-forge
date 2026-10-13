import { homedir } from "node:os";

import { loadDeskConfig } from "../config/config.load";
import { providerSchema, type Provider } from "../contracts";
import { parse, parseIssueNumber } from "./cli.args";
import { dockerIsolationFor } from "./cli.runtime";
import { UsageError, type CliCommand } from "./cli.types";
import { formatDoctorReport, type DoctorReport } from "../doctor/doctor.checks";
import {
  buildWorkerImage,
  dockerLogin,
  dockerStatus,
  pruneDocker,
  type DockerStatus
} from "../isolation/docker.admin";
import { dockerDoctorChecks } from "../isolation/docker.doctor";
import { runIsolationProbes } from "../isolation/docker.probe";
import type { DockerIsolation } from "../isolation/isolation.docker";
import { configPath, resolveRepoLocation } from "../store/store.root";

/** `pnpm desk docker build|login|doctor|status|prune`. Machine-level Docker commands. */

const USAGE = [
  "Usage: pnpm desk docker <command>",
  "  build [--no-cache]                    Build the worker image",
  "  login --provider claude|codex         Log in to a provider inside a container (needs a terminal)",
  "  doctor [--json]                       Check Docker, the image, the logins, and run the isolation probes",
  "  status [--json]                       List the desk containers, volumes, and images",
  "  prune --issue <n>                     Remove the containers and volumes of one issue",
  "  prune --all --yes [--auth]            Remove all desk containers and volumes. --auth also removes the logins"
].join("\n");

const formatStatus = (status: DockerStatus): string => {
  if (!status.daemon.ok) return `Docker is not reachable: ${status.daemon.detail}\n`;
  const image =
    status.image === null
      ? "unknown"
      : status.image.status === "current"
        ? `${status.image.tag} (current)`
        : `${status.image.tag} (${status.image.status})`;
  const section = (title: string, lines: string[]): string[] => [
    `${title}:`,
    ...(lines.length === 0 ? ["  none"] : lines.map((line) => `  ${line}`))
  ];
  return `${[
    `Image: ${image}`,
    ...section(
      "Containers",
      status.containers.map(
        (entry) => `${entry.name}  ${entry.status}  issue ${entry.issue || "-"}`
      )
    ),
    ...section(
      "Volumes",
      status.volumes.map((entry) => `${entry.name}  ${entry.kind}  issue ${entry.issue || "-"}`)
    ),
    ...section(
      "Images",
      status.images.map((entry) => `${entry.name}  ${entry.size}`)
    )
  ].join("\n")}\n`;
};

export const commandDocker: CliCommand = async (args, deps, io) => {
  const [sub, ...rest] = args;
  if (sub === undefined || !["build", "login", "doctor", "status", "prune"].includes(sub)) {
    throw new UsageError(USAGE);
  }
  if (deps.docker === undefined) {
    io.err("Docker support is not available in this desk process.\n");
    return 1;
  }
  const location = await resolveRepoLocation(deps.exec, deps.cwd);
  const loaded = await loadDeskConfig(configPath(location.repoRoot));
  if (!loaded.ok) {
    io.err(`Config error (${loaded.reason}): ${loaded.detail}\n`);
    return 1;
  }
  const isolation: DockerIsolation | undefined = dockerIsolationFor(deps, location, loaded.config);
  if (isolation === undefined) return 1;

  switch (sub) {
    case "build": {
      const { values, positionals } = parse(rest, { "no-cache": { type: "boolean" } });
      if (positionals.length > 0) throw new UsageError(USAGE);
      io.out("Building the worker image. The first build takes a few minutes.\n");
      const result = await buildWorkerImage(deps.docker.exec, location.repoRoot, {
        noCache: values["no-cache"] === true
      });
      io.out(result.ok ? `Built ${result.tag}.\n` : `${result.reason}\n`);
      return result.ok ? 0 : 1;
    }
    case "login": {
      const { values, positionals } = parse(rest, { provider: { type: "string" } });
      const provider = providerSchema.safeParse(values.provider);
      if (positionals.length > 0 || !provider.success) throw new UsageError(USAGE);
      const problem = await isolation.preflight();
      if (problem !== null) {
        io.err(`${problem}\n`);
        return 1;
      }
      const code = await dockerLogin(
        await isolation.machineContext(),
        provider.data satisfies Provider,
        deps.docker.interactive
      );
      io.out(
        code === 0
          ? `Logged in to ${provider.data}. The login is in the volume kaine-desk-auth-${provider.data}.\n`
          : `The ${provider.data} login did not finish (exit ${code}).\n`
      );
      return code === 0 ? 0 : 1;
    }
    case "doctor": {
      const { values, positionals } = parse(rest, { json: { type: "boolean" } });
      if (positionals.length > 0) throw new UsageError(USAGE);
      const checks = await dockerDoctorChecks({
        docker: isolation.docker,
        exec: deps.docker.exec,
        imageTag: await isolation.imageTag(),
        required: loaded.config.isolation === "docker",
        probe: async () =>
          runIsolationProbes(await isolation.machineContext(), [homedir(), location.repoRoot])
      });
      const report: DoctorReport = {
        ok: checks.every((entry) => entry.status !== "error"),
        checks
      };
      io.out(
        `${values.json === true ? JSON.stringify(report, null, 2) : formatDoctorReport(report)}\n`
      );
      return report.ok ? 0 : 1;
    }
    case "status": {
      const { values, positionals } = parse(rest, { json: { type: "boolean" } });
      if (positionals.length > 0) throw new UsageError(USAGE);
      const status = await dockerStatus(
        isolation.docker,
        deps.docker.exec,
        await isolation.imageTag()
      );
      io.out(values.json === true ? `${JSON.stringify(status, null, 2)}\n` : formatStatus(status));
      return status.daemon.ok ? 0 : 1;
    }
    default: {
      const { values, positionals } = parse(rest, {
        issue: { type: "string" },
        all: { type: "boolean" },
        yes: { type: "boolean" },
        auth: { type: "boolean" }
      });
      if (positionals.length > 0) throw new UsageError(USAGE);
      const all = values.all === true;
      if (all === (values.issue !== undefined)) {
        throw new UsageError(`Use --issue <n> or --all --yes.\n\n${USAGE}`);
      }
      if (all && values.yes !== true) {
        throw new UsageError(
          `--all removes every desk container and volume. Add --yes.\n\n${USAGE}`
        );
      }
      if (!all && values.auth === true) throw new UsageError("--auth goes with --all.");
      const result = await pruneDocker(
        isolation.docker,
        all
          ? { kind: "all", auth: values.auth === true }
          : { kind: "issue", scope: isolation.scopeOf(parseIssueNumber(values.issue)) }
      );
      io.out(
        `Removed ${result.containers.length} container(s) and ${result.volumes.length} volume(s).\n${[...result.containers, ...result.volumes].map((name) => `  ${name}\n`).join("")}`
      );
      return 0;
    }
  }
};
