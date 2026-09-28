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
  cancelled(id: string): boolean {
    return existsSync(this.file(`${z.string().uuid().parse(id)}.cancel`));
  }
  cancel(id: string): void {
    writeFileSync(this.file(`${z.string().uuid().parse(id)}.cancel`), "cancelled\n");
  }
}
