import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { commonDirectory, discoverCheckouts } from "./factory-checkouts";
import { fingerprint, factoryRunSchema, type FactoryRun } from "./factory.util";

const leaseSchema = z.object({
  id: z.string().uuid(),
  pid: z.number().int(),
  checkout: z.string(),
  issue: z.string().nullable()
});
export class FactoryCoordination {
  readonly directory: string;
  constructor(readonly root: string) {
    this.directory = path.join(commonDirectory(root), "kaine-factory");
    mkdirSync(this.directory, { recursive: true });
  }
  private read(file: string) {
    return leaseSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  }
  history(): FactoryRun[] {
    return discoverCheckouts(this.root).flatMap((checkout) => {
      const folder = path.join(checkout.path, ".ai.local/factory/runs");
      if (!existsSync(folder)) return [];
      return readdirSync(folder)
        .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
        .flatMap((name) => {
          const parsed = factoryRunSchema.safeParse(
            JSON.parse(readFileSync(path.join(folder, name), "utf8"))
          );
          if (!parsed.success) throw new Error(`Unreadable factory history in ${checkout.path}`);
          return [parsed.data];
        });
    });
  }
  acquire(id: string, issue: string | null): () => void {
    const mutex = path.join(this.directory, "admission.lock");
    writeFileSync(mutex, JSON.stringify({ pid: process.pid, id, checkout: this.root }), {
      flag: "wx"
    });
    try {
      const leases = readdirSync(this.directory)
        .filter((file) => file.endsWith(".lease.json"))
        .map((file) => this.read(path.join(this.directory, file)));
      const legacy = discoverCheckouts(this.root).flatMap((checkout) => {
        const file = path.join(checkout.path, ".ai.local/factory/runs/active.json");
        if (!existsSync(file)) return [];
        const active = z
          .object({ id: z.string().uuid() })
          .parse(JSON.parse(readFileSync(file, "utf8")));
        return leases.some((lease) => lease.id === active.id) ? [] : [active];
      });
      if (legacy.length)
        throw new Error(
          "A legacy or interrupted controller owns a worktree; recover it before parallel execution"
        );
      if (leases.length >= 2) throw new Error("Both repository execution slots are occupied");
      if (leases.some((lease) => lease.checkout === this.root || (issue && lease.issue === issue)))
        throw new Error("This worktree or issue already has an active run");
      const file = path.join(this.directory, `${id}.lease.json`);
      writeFileSync(file, JSON.stringify({ id, pid: process.pid, checkout: this.root, issue }), {
        flag: "wx"
      });
      return () => this.release(id);
    } finally {
      rmSync(mutex);
    }
  }
  release(id: string): void {
    for (const name of readdirSync(this.directory).filter((file) =>
      /(?:\.lease|\.resource)\.json$/.test(file)
    )) {
      const file = path.join(this.directory, name);
      if (this.read(file).id === id) rmSync(file);
    }
  }
  recover(id: string): void {
    const mutex = path.join(this.directory, "admission.lock");
    if (existsSync(mutex)) {
      const owner = z
        .object({ id: z.string().uuid(), pid: z.number().int(), checkout: z.string() })
        .parse(JSON.parse(readFileSync(mutex, "utf8")));
      if (owner.id === id) {
        if (owner.checkout !== this.root)
          throw new Error("Recover this admission from its original worktree");
        try {
          process.kill(owner.pid, 0);
          throw new Error("Controller is still active");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
        }
        writeFileSync(path.join(this.directory, `${id}.admission-recovered`), "recovered", {
          flag: "wx"
        });
        rmSync(mutex);
      }
    }
    const file = path.join(this.directory, `${id}.lease.json`);
    if (!existsSync(file)) return;
    const lease = this.read(file);
    if (lease.checkout !== this.root)
      throw new Error("Recover this run from its original worktree");
    try {
      process.kill(lease.pid, 0);
      throw new Error("Controller is still active");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
    this.release(id);
  }
  async resource(
    name: string,
    id: string,
    check: () => void,
    waiting: (reason: string | null) => void
  ): Promise<() => void> {
    const file = path.join(this.directory, `${fingerprint(name)}.resource.json`);
    while (true) {
      check();
      try {
        writeFileSync(
          file,
          JSON.stringify({ id, pid: process.pid, checkout: this.root, issue: null }),
          { flag: "wx" }
        );
        waiting(null);
        return () => {
          if (existsSync(file) && this.read(file).id === id) rmSync(file);
        };
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
        const owner = this.read(file);
        try {
          process.kill(owner.pid, 0);
        } catch {
          throw new Error(`Resource ${name} needs explicit recovery of run ${owner.id}`);
        }
        waiting(name);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  completed(repository: string, run: FactoryRun): boolean {
    return existsSync(
      path.join(
        this.directory,
        `decision-${fingerprint(`${repository}:${run.issue}:${run.stage}:${run.authorization}`)}.json`
      )
    );
  }
  record(repository: string, run: FactoryRun): void {
    if (run.authorization === "local-pilot" || run.status !== "completed") return;
    if (this.completed(repository, run)) return;
    writeFileSync(
      path.join(
        this.directory,
        `decision-${fingerprint(`${repository}:${run.issue}:${run.stage}:${run.authorization}`)}.json`
      ),
      JSON.stringify({ id: run.id, issue: run.issue, checkout: this.root, pr: run.pr }),
      { flag: "wx" }
    );
  }
}
