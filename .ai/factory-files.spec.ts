import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";

import { exclusiveJson, readOptional } from "./factory-files";

it("publishes exactly one complete record under competing writers", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "factory-lock-test-"));
  const file = path.join(root, "owner.json");
  if (path.dirname(root) !== path.resolve(tmpdir())) throw new Error("Unsafe fixture cleanup");
  try {
    const module = new URL("./factory-files.ts", import.meta.url).href;
    const results = await Promise.all(
      Array.from(
        { length: 8 },
        (_, index) =>
          new Promise<number | null>((resolve, reject) => {
            const source = `import { exclusiveJson } from ${JSON.stringify(module)}; try { exclusiveJson(${JSON.stringify(file)}, { writer: ${index}, complete: 'x'.repeat(65536) }); } catch (error) { if (error.code !== 'EEXIST') throw error; process.exitCode = 2; }`;
            const child = spawn(
              process.execPath,
              ["--import", "tsx", "--input-type=module", "-e", source],
              { windowsHide: true, stdio: "ignore" }
            );
            child.on("error", reject);
            child.on("close", resolve);
          })
      )
    );
    expect(results.filter((code) => code === 0)).toHaveLength(1);
    expect(results.filter((code) => code === 2)).toHaveLength(7);
    const contents = readOptional(file);
    expect(contents).not.toBeNull();
    const owner = z
      .object({ writer: z.number().int(), complete: z.string().length(65536) })
      .parse(JSON.parse(contents ?? ""));
    expect(owner.writer).toBeGreaterThanOrEqual(0);
    expect(() => exclusiveJson(file, { writer: 9 })).toThrow();
    expect(readdirSync(root)).toEqual(["owner.json"]);
    rmSync(file);
    expect(readOptional(file)).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
