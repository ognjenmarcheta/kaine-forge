import { actionSchema, type ActionRequest, type FactoryAction } from "@repo/factory-ui/contracts";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { REPO_ROOT } from "./ai.util";
import { redact } from "./factory-progress";
import type { FactoryStore } from "./factory-store";
import { readHistory } from "./factory-ui-data";
import { stopProcessTree } from "./process-cleanup.util";

export class DashboardActions {
  private readonly children = new Map<string, ChildProcess>();
  private stopping = false;
  constructor(
    private readonly store: FactoryStore,
    private readonly root: string
  ) {
    for (const action of this.list())
      if (action.state === "running") {
        action.state = "cleanup-unverified";
        action.detail = "Dashboard interrupted. Inspect and cancel its run before retrying.";
        this.save(action);
      }
    this.pruneRefreshes();
  }
  private save(action: FactoryAction): void {
    this.store.write(`action-${action.id}.json`, z.json().parse(action));
    if (
      action.request.kind === "refresh" &&
      ["completed", "failed", "interrupted"].includes(action.state)
    )
      this.pruneRefreshes();
  }
  private pruneRefreshes(): void {
    for (const action of this.list()
      .filter(
        (item) =>
          item.request.kind === "refresh" &&
          ["completed", "failed", "interrupted"].includes(item.state)
      )
      .slice(10))
      rmSync(this.store.file(`action-${action.id}.json`), { force: true });
  }
  list(): FactoryAction[] {
    return readdirSync(this.store.directory)
      .filter((file) => /^action-[a-f0-9-]{36}\.json$/.test(file))
      .flatMap((file) => {
        try {
          return [actionSchema.parse(JSON.parse(readFileSync(this.store.file(file), "utf8")))];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  watcher(): boolean {
    return this.list().some(
      (action) => action.request.kind === "watch-start" && this.children.has(action.id)
    );
  }

  start(request: ActionRequest): FactoryAction {
    if (this.stopping) throw new Error("Dashboard is stopping");
    const existingFile = this.store.file(`action-${request.key}.json`);
    if (existsSync(existingFile)) {
      const existing = actionSchema.parse(JSON.parse(readFileSync(existingFile, "utf8")));
      if (JSON.stringify(existing.request) !== JSON.stringify(request))
        throw new Error("Action key already used for another request");
      return existing;
    }
    if (
      !["refresh", "cancel", "watch-stop"].includes(request.kind) &&
      this.list().some(
        (action) =>
          this.children.has(action.id) && !["refresh", "cancel"].includes(action.request.kind)
      )
    )
      throw new Error("Another dashboard operation is running");
    let args: string[];
    let retryOf: string | undefined;
    switch (request.kind) {
      case "start":
        args = [
          "run",
          "--issue",
          String(request.issue),
          "--stage",
          request.stage,
          "--provider",
          request.provider
        ];
        break;
      case "retry": {
        const run = readHistory(this.store).runs.find((entry) => entry.id === request.run);
        if (!run || !["failed", "cancelled"].includes(run.status))
          throw new Error("Only failed or cancelled attempts can be retried");
        if (run.cleanup?.status === "cleanup-unverified")
          throw new Error("Recover this run before retrying");
        if (run.authorization === "local-pilot")
          throw new Error("Start a selected provider pilot from Health");
        retryOf = run.id;
        args = [
          "run",
          "--issue",
          String(run.issue),
          "--stage",
          run.stage,
          "--provider",
          run.provider
        ];
        break;
      }
      case "cancel":
        args = ["cancel", "--run", request.run];
        break;
      case "doctor":
        args = ["doctor"];
        break;
      case "pilot":
        args = ["pilot", "--provider", request.provider, "--tier", request.tier];
        break;
      case "watch-start":
        args = ["watch"];
        break;
      case "refresh":
        args = ["ui-snapshot"];
        break;
      case "watch-stop":
        args = [];
        break;
    }
    const action: FactoryAction = {
      id: request.key,
      request,
      state: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      runId: null,
      detail: ""
    };
    this.save(action);
    if (request.kind === "watch-stop") {
      void this.stopWatcher()
        .then(() => {
          action.state = "completed";
          action.finishedAt = new Date().toISOString();
          this.save(action);
        })
        .catch(() => {
          action.state = "cleanup-unverified";
          this.save(action);
        });
    } else this.execute(action, args, retryOf);
    return action;
  }
  private execute(action: FactoryAction, args: string[], retryOf?: string): void {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(REPO_ROOT, ".ai/factory.ts"), ...args, "--checkout", this.root],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          KAINE_FACTORY_ACTION_ID: action.id,
          KAINE_FACTORY_RETRY_OF: retryOf ?? ""
        },
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    this.children.set(action.id, child);
    let errors = "";
    child.stdout?.on("data", () => {
      /* Factory output includes source proposals. Never expose it. */
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-8192);
    });
    child.once("error", (error) => {
      errors = redact(error.message);
    });
    const timeout =
      action.request.kind === "refresh" || action.request.kind === "doctor"
        ? setTimeout(() => {
            void this.stopOwned(action).catch(() => {
              /* Failure is persisted by stopOwned. */
            });
          }, 180000)
        : undefined;
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (!this.children.has(action.id)) return;
      this.children.delete(action.id);
      const run = readHistory(this.store).runs.find((entry) => entry.actionId === action.id);
      action.runId = run?.id ?? null;
      if (action.state === "running") action.state = code === 0 ? "completed" : "failed";
      action.finishedAt = new Date().toISOString();
      action.detail = redact(
        run?.detail ||
          errors ||
          (code === 0 ? "Command finished" : "Command failed; inspect Health and run evidence")
      );
      this.save(action);
    });
  }
  private async stopOwned(action: FactoryAction): Promise<void> {
    const child = this.children.get(action.id);
    if (!child) return;
    // Stop first, then inspect ownership: the child can acquire the lock during shutdown.
    const cleanup = await stopProcessTree(child);
    const active = this.store.active();
    const owned = readHistory(this.store).runs.find(
      (run) => run.id === active?.id && run.actionId === action.id
    );
    const cleanupId = owned?.id ?? (active?.pid === child.pid ? active?.id : null);
    if (cleanupId) this.store.cancel(cleanupId);
    // Kill the controller before cleanup so it cannot create another worker or publish.
    let containers = true;
    if (cleanupId)
      containers = await new Promise<boolean>((resolve) => {
        const cancel = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            path.join(REPO_ROOT, ".ai/factory.ts"),
            "cancel",
            "--run",
            cleanupId,
            "--checkout",
            this.root
          ],
          { cwd: REPO_ROOT, windowsHide: true, stdio: "ignore" }
        );
        const timer = setTimeout(() => {
          void stopProcessTree(cancel);
          resolve(false);
        }, 30000);
        cancel.once("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
        cancel.once("close", (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      });
    action.state = cleanup === "passed" && containers ? "interrupted" : "cleanup-unverified";
    action.finishedAt = new Date().toISOString();
    action.detail =
      action.state === "interrupted"
        ? "Stopped by dashboard; explicit retry required"
        : "Cleanup could not be verified";
    this.children.delete(action.id);
    if (cleanup === "passed" && containers && child.pid) this.store.releaseWatcher(child.pid);
    this.save(action);
    if (action.state === "cleanup-unverified") throw new Error(action.detail);
  }
  private async stopWatcher(): Promise<void> {
    const action = this.list().find(
      (entry) => entry.request.kind === "watch-start" && this.children.has(entry.id)
    );
    if (!action) throw new Error("No dashboard-owned watcher is running");
    await this.stopOwned(action);
  }
  async stop(): Promise<void> {
    this.stopping = true;
    const results = await Promise.allSettled(
      this.list()
        .filter((action) => this.children.has(action.id))
        .map((action) => this.stopOwned(action))
    );
    if (results.some((entry) => entry.status === "rejected"))
      throw new Error("Dashboard cleanup could not be verified; inspect factory status");
  }
}
