import { stateSchema } from "@repo/factory-ui/contracts";
import { z } from "zod";

import type { FactoryCheckout } from "./factory-checkouts";
import { redact } from "./factory-progress";
import type { FactoryStore } from "./factory-store";
import type { DashboardActions } from "./factory-ui-actions";
import {
  alive,
  githubState,
  healthState,
  historyQuerySchema,
  readHistory,
  summarizeRun,
  summaryContext
} from "./factory-ui-data";
import type { FactoryConfig } from "./factory.util";

export interface DashboardTarget {
  worktree: FactoryCheckout;
  store: FactoryStore;
  actions: DashboardActions;
  config: FactoryConfig;
}
export function dashboardState(
  targets: DashboardTarget[],
  worktrees: FactoryCheckout[],
  selected: string | null,
  query: z.infer<typeof historyQuerySchema>
) {
  const primary = targets.find((target) => target.worktree.id === selected) ?? targets[0];
  if (!primary) throw new Error("No configured factory checkout is available");
  const visible = selected ? targets.filter((target) => target.worktree.id === selected) : targets;
  const snapshots = visible.map((target) => {
    const history = readHistory(target.store);
    const context = summaryContext(target.store);
    let active: ReturnType<FactoryStore["active"]> = null;
    try {
      active = target.store.active();
    } catch {
      history.warnings.push(
        `Unreadable active lock in ${target.worktree.path}; inspect before starting work`
      );
    }
    return {
      ...target,
      history,
      active,
      runs: history.runs.map((run) => ({
        ...summarizeRun(target.store, run, context),
        worktreeId: target.worktree.id,
        worktree: `${target.worktree.branch} · ${target.worktree.path}`
      }))
    };
  });
  const runs = snapshots
    .flatMap((target) => target.runs)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const summaries = runs.filter(
    (run) =>
      run.pilot === (query.pilots === "true") &&
      (!query.provider || run.provider === query.provider) &&
      (!query.stage || run.stage === query.stage) &&
      (!query.status || run.status === query.status) &&
      (!query.date || run.startedAt.startsWith(query.date)) &&
      (!query.search ||
        `${run.issue} ${run.detail} ${run.worktree}`
          .toLowerCase()
          .includes(query.search.toLowerCase()))
  );
  const activeRuns = snapshots.flatMap((target) =>
    target.runs.filter((run) => run.id === target.active?.id)
  );
  const actions = snapshots
    .flatMap((target) =>
      target.actions.list().map((action) => ({
        ...action,
        request: { ...action.request, worktreeId: target.worktree.id },
        detail: redact(action.detail),
        runId:
          action.runId ?? target.history.runs.find((run) => run.actionId === action.id)?.id ?? null
      }))
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 30);
  return stateSchema.parse({
    worktrees,
    selectedWorktree: selected,
    activeRuns,
    repository: primary.config.repository,
    enabled: primary.worktree.id === selected && primary.config.enabled,
    watchEnabled: primary.worktree.id === selected && primary.config.watch,
    watcher: snapshots.some((target) => target.actions.watcher())
      ? "running"
      : snapshots.some((target) => target.store.watcher())
        ? "external"
        : "stopped",
    stages: primary.config.stages,
    models: primary.config.models,
    at: new Date().toISOString(),
    active: activeRuns[0]?.id ?? null,
    activeRun: activeRuns[0] ?? null,
    warnings: [
      ...worktrees
        .filter(
          (worktree) =>
            worktree.configured && !targets.some((target) => target.worktree.id === worktree.id)
        )
        .map((worktree) => `Unavailable or invalid configuration: ${worktree.path}`),
      ...snapshots.flatMap((target) => [
        ...target.history.warnings,
        ...(target.active && !alive(target.active.pid)
          ? [`Interrupted controller in ${target.worktree.path}; explicit recovery required`]
          : [])
      ])
    ],
    runs: summaries.slice(query.page * 25, (query.page + 1) * 25),
    total: summaries.length,
    page: query.page,
    attention: runs
      .filter((run) => !run.pilot && ["failed", "blocked", "interrupted"].includes(run.status))
      .slice(0, 10),
    actions,
    github: githubState(primary.store),
    health: healthState(primary.store)
  });
}
