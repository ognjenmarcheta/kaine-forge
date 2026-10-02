import { githubSchema, healthSchema } from "@repo/factory-ui/contracts";
import { readFileSync } from "node:fs";
import { z } from "zod";

import { REPO_ROOT } from "./ai.util";
import { currentApproval } from "./factory";
import { docker } from "./factory-docker";
import { github, githubPages, monitoringSnapshot } from "./factory-github";
import { pilotFingerprint, pilotTierSchema, requirePilots } from "./factory-pilot";
import { redact } from "./factory-progress";
import type { FactoryStore } from "./factory-store";
import { githubState, readHistory } from "./factory-ui-data";
import {
  factoryProviderSchema,
  issueSchema,
  readiness,
  safeFile,
  type FactoryConfig
} from "./factory.util";

/** Runs in a child process; synchronous Docker/GitHub operations never block HTTP. */
export async function refreshSnapshot(config: FactoryConfig, store: FactoryStore): Promise<void> {
  const previous = githubState(store);
  const runs = readHistory(store).runs;
  try {
    const issues = githubPages(`repos/${config.repository}/issues?state=open`)
      .filter((value) => !z.object({ pull_request: z.json() }).safeParse(value).success)
      .map((value) => issueSchema.parse(value));
    const queue = issues.map((issue) => {
      let group: "ready" | "spec" | "waiting" = issue.labels.some(
        (label) => label.name === "needs-spec"
      )
        ? "spec"
        : "waiting";
      let reason = "Owner readiness decision or more information required";
      if (issue.labels.some((label) => label.name === "ready-for-agent")) {
        try {
          const approval = currentApproval(config, issue.number, store);
          if (
            store
              .history()
              .some(
                (run) =>
                  run.issue === issue.number &&
                  run.stage === "implement" &&
                  run.authorization === approval.authorization &&
                  run.status === "completed"
              )
          )
            throw new Error("This readiness decision already produced a completed run");
          const fields = readiness(issue.body ?? "");
          if (fields.missing.length || !fields.tier || !fields.scope.length)
            throw new Error("Six readiness fields and a supported validation tier are required");
          if (fields.tier === "native")
            throw new Error("Native checks require a supported environment");
          for (const scope of fields.scope) safeFile(scope.replace(/\/$/, ""));
          group = "ready";
          reason = "Eligible; readiness is checked again on start";
        } catch (error) {
          reason = error instanceof Error ? redact(error.message) : "Readiness blocked";
        }
      }
      return { number: issue.number, title: redact(issue.title), group, reason };
    });
    const pulls: Record<string, "open" | "closed" | "merged"> = {};
    const prefix = `https://github.com/${config.repository}/pull/`;
    const numbers = new Set(
      runs.flatMap((run) => {
        if (!run.pr) return [];
        const number = run.pr.startsWith(prefix) ? run.pr.slice(prefix.length) : "";
        if (!/^[1-9][0-9]*$/.test(number) || !Number.isSafeInteger(Number(number)))
          throw new Error("Invalid run pull request reference");
        return [number];
      })
    );
    for (const number of numbers) {
      const pr = z
        .object({
          html_url: z.string(),
          state: z.enum(["open", "closed"]),
          merged_at: z.string().nullable()
        })
        .parse(github(`repos/${config.repository}/pulls/${number}`));
      if (pr.html_url !== `${prefix}${number}`)
        throw new Error("Pull request response differs from its reference");
      pulls[`${prefix}${number}`] = pr.merged_at ? "merged" : pr.state;
    }
    const failures = monitoringSnapshot(config)
      .filter(
        (entry) => entry.conclusion && !["success", "skipped", "neutral"].includes(entry.conclusion)
      )
      .map((entry) => redact(JSON.stringify(entry)));
    store.write(
      "ui-github.json",
      githubSchema.parse({
        at: new Date().toISOString(),
        error: null,
        issues: queue,
        pulls,
        failures
      })
    );
  } catch (error) {
    store.write("ui-github.json", {
      ...previous,
      error: redact(error instanceof Error ? error.message : "GitHub unavailable")
    });
  }
  let available = false;
  try {
    docker(["info", "--format", "{{.OSType}}"]);
    available = true;
  } catch {
    /* recorded below */
  }
  let rollout: string | null = null;
  try {
    requirePilots(config, store, REPO_ROOT);
  } catch (error) {
    rollout =
      error instanceof z.ZodError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
        ? "Live pilot evidence is missing or stale. Run all six provider pilots with the current configuration, then complete an owner-approved issue-to-PR trial."
        : redact(error instanceof Error ? error.message : "Rollout not verified");
  }
  const fingerprint = pilotFingerprint(config, REPO_ROOT);
  const pilots = factoryProviderSchema.options.flatMap((provider) =>
    pilotTierSchema.options.map((tier) => {
      try {
        const receipt = z
          .object({
            fingerprint: z.string(),
            run: z.string().uuid(),
            provider: z.literal(provider),
            tier: z.literal(tier),
            passed: z.literal(true)
          })
          .parse(JSON.parse(readFileSync(store.file(`pilot-${provider}-${tier}.json`), "utf8")));
        const run = runs.find((entry) => entry.id === receipt.run);
        return {
          provider,
          tier,
          current:
            !!run &&
            run.status === "completed" &&
            run.authorization === "local-pilot" &&
            run.provider === provider &&
            run.model === config.models[provider] &&
            receipt.fingerprint === fingerprint &&
            run.snapshot === fingerprint &&
            run.validation.at(-1)?.passed === true &&
            run.invocations.length > 0 &&
            run.invocations.every((item) => item.cleanup),
          at: run?.finishedAt ?? null
        };
      } catch {
        return { provider, tier, current: false, at: null };
      }
    })
  );
  let workers: z.infer<typeof healthSchema>["workers"] = [];
  let at: string | null = null;
  try {
    const doctor = z
      .object({
        at: z.string(),
        fingerprint: z.literal(fingerprint),
        workers: healthSchema.shape.workers
      })
      .parse(JSON.parse(readFileSync(store.file("doctor.json"), "utf8")));
    workers = doctor.workers;
    at = doctor.at;
  } catch {
    /* Never infer authentication from a model configuration. */
  }
  store.write(
    "ui-health.json",
    z.json().parse(healthSchema.parse({ at, docker: available, rollout, workers, pilots }))
  );
}
