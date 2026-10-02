import { randomUUID } from "node:crypto";
import { linkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { z } from "zod";

/** Publish complete ownership data without replacing an existing owner. */
export function exclusiveJson(file: string, value: z.infer<ReturnType<typeof z.json>>): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    linkSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readOptional(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
