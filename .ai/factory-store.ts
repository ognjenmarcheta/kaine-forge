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

import { factoryRunSchema, type FactoryRun } from "./factory.util";

export class FactoryStore {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
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
    this.write(`${run.id}.json`, z.json().parse(factoryRunSchema.parse(run)));
  }
  acquire(id: string): () => void {
    z.string().uuid().parse(id);
    if (this.cancelled(id)) throw new Error("Run cancelled");
    // Never steal a stale lock. Cancel inspects and stops the recorded containers first.
    try {
      writeFileSync(this.file("active.json"), JSON.stringify({ id, pid: process.pid }), {
        flag: "wx",
        mode: 0o600
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST")
        throw new Error(
          `Factory is busy with run ${this.active()?.id}. Use factory status or cancel that run.`
        );
      throw error;
    }
    return () => {
      const active = this.active();
      if (active?.id === id) rmSync(this.file("active.json"));
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
    return this.runs()
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
    return true;
  }
  cancelled(id: string): boolean {
    return existsSync(this.file(`${z.string().uuid().parse(id)}.cancel`));
  }
  cancel(id: string): void {
    writeFileSync(this.file(`${z.string().uuid().parse(id)}.cancel`), "cancelled\n");
  }
}
