import {
  githubSchema,
  healthSchema,
  type RunSummary,
  type RunDetail
} from "@repo/factory-ui/contracts";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { containedFile, events, redact, registeredArtifacts } from "./factory-progress";
import type { FactoryStore } from "./factory-store";
import { factoryRunSchema, type FactoryRun } from "./factory.util";
import { codingRunSchema } from "./run-report.util";

export function readHistory(store: FactoryStore): { runs: FactoryRun[]; warnings: string[] } {
  const runs: FactoryRun[] = [];
  const warnings: string[] = [];
  for (const name of readdirSync(store.directory).filter((file) =>
    /^[a-f0-9-]{36}\.json$/.test(file)
  )) {
    try {
      runs.push(factoryRunSchema.parse(JSON.parse(readFileSync(store.file(name), "utf8"))));
    } catch {
      warnings.push(`Unreadable run ${name.slice(0, -5)}`);
    }
  }
  return { runs: runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)), warnings };
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function githubState(store: FactoryStore) {
  try {
    return githubSchema.parse(JSON.parse(readFileSync(store.file("ui-github.json"), "utf8")));
  } catch {
    return githubSchema.parse({
      at: null,
      error: "GitHub has not been refreshed",
      issues: [],
      pulls: {},
      failures: []
    });
  }
}
export function healthState(store: FactoryStore) {
  try {
    return healthSchema.parse(JSON.parse(readFileSync(store.file("ui-health.json"), "utf8")));
  } catch {
    return healthSchema.parse({
      at: null,
      docker: null,
      rollout: "Health has not been checked",
      workers: [],
      pilots: []
    });
  }
}

export function summaryContext(store: FactoryStore) {
  const directory = path.join(store.directory, "..", "reports");
  const outcomes = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
        .flatMap((name) => {
          try {
            const report = codingRunSchema.parse(
              JSON.parse(readFileSync(path.join(directory, name), "utf8"))
            );
            return report.outcome ? [report] : [];
          } catch {
            return [];
          }
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    : [];
  let active: ReturnType<FactoryStore["active"]> = null;
  try {
    active = store.active();
  } catch {
    /* The board reports the unreadable lock. */
  }
  return { active, pulls: githubState(store).pulls, outcomes };
}

export function summarizeRun(
  store: FactoryStore,
  run: FactoryRun,
  context = summaryContext(store)
): RunSummary {
  const journal = events(store, run.id).events;
  const recent = [...journal].reverse();
  const unfinished = recent.find(
    (event) =>
      event.state === "started" &&
      recent.find((entry) => entry.phase === event.phase)?.state === "started"
  );
  const active = context.active;
  const interrupted = run.status === "running" && (active?.id !== run.id || !alive(active.pid));
  const outcome = context.outcomes.find(
    (report) => report.factoryRunId === run.id || report.note?.startsWith(`Factory run ${run.id}.`)
  );
  const acceptance = outcome?.outcome ?? null;
  const reviewMinutes = outcome?.reviewMinutes ?? null;
  // A repaired initial failure stays in Checks. Only validated publication establishes final success.
  const validation =
    run.validation.length === 0
      ? "untested"
      : run.status === "completed" && run.validation.at(-1)?.passed
        ? "passed"
        : run.validation.some((entry) => !entry.passed)
          ? "failed"
          : "passed";
  return {
    id: run.id,
    issue: run.issue,
    stage: run.stage,
    provider: run.provider,
    model: redact(run.model),
    waiting: run.waiting ?? null,
    currentCommand: run.currentCommand
      ? { ...run.currentCommand, command: redact(run.currentCommand.command) }
      : null,
    cleanup: run.cleanup ? { ...run.cleanup, errors: run.cleanup.errors.map(redact) } : undefined,
    status: interrupted ? "interrupted" : run.status,
    detail: redact(run.detail),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    lastActivity: run.currentCommand?.lastOutputAt ?? journal.at(-1)?.at ?? null,
    phase:
      run.status === "running"
        ? (unfinished?.phase ?? journal.at(-1)?.phase ?? null)
        : (journal.at(-1)?.phase ?? null),
    pilot: run.authorization === "local-pilot",
    retryOf: run.retryOf ?? null,
    pr:
      run.pr && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(run.pr) ? run.pr : null,
    revision: run.revision,
    candidate: run.candidate ?? null,
    validation,
    acceptance,
    reviewMinutes,
    merge: run.pr ? (context.pulls[run.pr] ?? "unavailable") : "unavailable"
  };
}

export function artifactKind(name: string): "image" | "video" | "log" | "download" {
  return /\.(png|jpe?g)$/i.test(name)
    ? "image"
    : /\.(webm|mp4)$/i.test(name)
      ? "video"
      : /\.(log|txt)$/i.test(name)
        ? "log"
        : "download";
}

export function runDetail(store: FactoryStore, run: FactoryRun): RunDetail {
  const journal = events(store, run.id);
  const warnings = [...journal.warnings];
  let registrations: ReturnType<typeof registeredArtifacts> = [];
  try {
    registrations = registeredArtifacts(store, run.id);
  } catch {
    warnings.push("Artifact registry is unreadable");
  }
  const artifacts = registrations.flatMap((entry) => {
    try {
      const file = containedFile(path.dirname(store.directory), entry.path, store.anchor);
      return [
        {
          id: entry.id,
          name: redact(entry.name),
          kind: artifactKind(entry.name),
          size: statSync(file).size
        }
      ];
    } catch {
      warnings.push(`Artifact unavailable: ${redact(entry.name)}`);
      return [];
    }
  });
  if (!journal.events.length) warnings.push("Historical phase timing is unavailable");
  return {
    ...summarizeRun(store, run),
    events: journal.events,
    warnings,
    artifacts,
    checks: run.validation.map((check) => ({
      command: redact(check.command),
      passed: check.passed,
      startedAt: check.startedAt,
      finishedAt: check.finishedAt,
      artifactId: registrations.find((item) => item.path === `runs/${check.artifact}`)?.id ?? null
    })),
    evidence:
      run.result?.evidence.map((item) => ({
        ...item,
        criterion: redact(item.criterion),
        detail: redact(item.detail)
      })) ?? [],
    findings:
      run.result?.findings.map((item) => ({
        ...item,
        path: redact(item.path),
        body: redact(item.body)
      })) ?? [],
    invocations: run.invocations.map((item) => ({
      ...item,
      model: redact(item.model),
      cliVersion: redact(item.cliVersion)
    }))
  };
}

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).default(""),
  provider: z.enum(["", "codex", "claude"]).default(""),
  stage: z.enum(["", "intake", "spec", "implement", "review", "learn"]).default(""),
  status: z
    .enum(["", "running", "completed", "failed", "blocked", "cancelled", "interrupted"])
    .default(""),
  pilots: z.enum(["true", "false"]).default("false"),
  date: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .default("")
});
