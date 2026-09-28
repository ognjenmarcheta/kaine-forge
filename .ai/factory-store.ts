import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { z } from "zod";

import { FactoryCoordination } from "./factory-coordination";
import { factoryRunSchema, type FactoryRun } from "./factory.util";

export class FactoryStore {
  readonly coordination?: FactoryCoordination;
  constructor(
    readonly directory: string,
    readonly checkout?: string
  ) {
    mkdirSync(directory, { recursive: true });
    if (checkout) this.coordination = new FactoryCoordination(checkout);
  }
  file(name: string): string {
    if (!/^[a-zA-Z0-9.-]+$/.test(name) || name.startsWith("."))
      throw new Error("Invalid state filename");
    return path.join(this.directory, name);
  }
  write(name: string, value: z.infer<ReturnType<typeof z.json>>): void {
    const target = this.file(name);
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, target);
  }
  runs(): FactoryRun[] {
    return readdirSync(this.directory)
      .filter((file) => /^[a-f0-9-]{36}\.json$/.test(file))
      .map((file) => factoryRunSchema.parse(JSON.parse(readFileSync(this.file(file), "utf8"))));
  }
  save(run: FactoryRun): void {
    if (!existsSync(this.file(`${run.id}.json`)) && process.env.KAINE_FACTORY_ACTION_ID)
      run.actionId = z.string().uuid().parse(process.env.KAINE_FACTORY_ACTION_ID);
    if (!existsSync(this.file(`${run.id}.json`)) && process.env.KAINE_FACTORY_RETRY_OF)
      run.retryOf = z.string().uuid().parse(process.env.KAINE_FACTORY_RETRY_OF);
    this.write(`${run.id}.json`, z.json().parse(factoryRunSchema.parse(run)));
  }
  history(): FactoryRun[] {
    return this.coordination?.history() ?? this.runs();
  }
  async resource(name: string, run: FactoryRun): Promise<() => void> {
    return (
      this.coordination?.resource(
        name,
        run.id,
        () => this.assertActive(run.id),
        (reason) => {
          if (run.waiting !== reason) {
            run.waiting = reason;
            this.save(run);
          }
        }
      ) ?? (() => {})
    );
  }
  acquire(id: string, issue: string | null = null): () => void {
    z.string().uuid().parse(id);
    if (this.cancelled(id)) throw new Error("Run cancelled");
    // Never steal a stale lock. Cancel inspects and stops the recorded containers first.
    const sharedRelease = this.coordination?.acquire(id, issue);
    try {
      writeFileSync(this.file("active.json"), JSON.stringify({ id, pid: process.pid }), {
        flag: "wx",
        mode: 0o600
      });
    } catch (error) {
      sharedRelease?.();
      if (error instanceof Error && "code" in error && error.code === "EEXIST")
        throw new Error(
          `Factory is busy with run ${this.active()?.id}. Use factory status or cancel that run.`
        );
      throw error;
    }
    return () => {
      const active = this.active();
      if (active?.id === id) rmSync(this.file("active.json"));
      sharedRelease?.();
    };
  }
  active() {
    const file = this.file("active.json");
    return existsSync(file)
      ? z
          .object({ id: z.string().uuid(), pid: z.number().int() })
          .parse(JSON.parse(readFileSync(file, "utf8")))
      : null;
  }
  assertActive(id: string): void {
    if (this.cancelled(id)) throw new Error("Run cancelled");
    const active = this.active();
    if (active?.id !== id || active.pid !== process.pid)
      throw new Error("Controller no longer owns the factory lock");
  }
  comments(issue: number): NonNullable<FactoryRun["statusComment"]>[] {
    return this.history()
      .filter((run) => run.issue === issue)
      .flatMap((run) => (run.statusComment ? [run.statusComment] : []));
  }
  recoverCancelled(id: string): boolean {
    const active = this.active();
    if (active?.id !== id || !this.cancelled(id)) return false;
    try {
      process.kill(active.pid, 0);
      return false;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
    // Only one canceller may ever remove this dead run's lock. The receipt stays
    // on disk so a delayed canceller cannot remove a subsequently acquired lock.
    try {
      writeFileSync(this.file(`${id}.recovered`), "recovered\n", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        if (this.active()?.id === id)
          throw new Error(
            "Run recovery is already claimed; cleanup remains unverified until its lock is released"
          );
        return false;
      }
      throw error;
    }
    if (this.active()?.id !== id) return false;
    rmSync(this.file("active.json"));
    this.coordination?.release(id);
    return true;
  }
  cancelled(id: string): boolean {
    return existsSync(this.file(`${z.string().uuid().parse(id)}.cancel`));
  }
  cancel(id: string): void {
    writeFileSync(this.file(`${z.string().uuid().parse(id)}.cancel`), "cancelled\n");
  }
  watcher(): { pid: number } | null {
    const file = this.file("watcher.json");
    return existsSync(file)
      ? z.object({ pid: z.number().int().positive() }).parse(JSON.parse(readFileSync(file, "utf8")))
      : null;
  }
  acquireWatcher(): () => void {
    writeFileSync(this.file("watcher.json"), JSON.stringify({ pid: process.pid }), {
      flag: "wx",
      mode: 0o600
    });
    return () => this.releaseWatcher(process.pid);
  }
  releaseWatcher(pid: number): void {
    if (this.watcher()?.pid === pid) rmSync(this.file("watcher.json"));
  }
}
