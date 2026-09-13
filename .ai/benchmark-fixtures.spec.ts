import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";
import { benchmarkFixtures, seedBenchmark } from "./benchmark-fixtures";

it("seeds only the identified defect and rejects drift or repeated seeding", () => {
  for (const name of ["query-key", "notes-deletion"] as const) {
    const fixture = benchmarkFixtures[name];
    const original = readFileSync(path.join(REPO_ROOT, fixture.target), "utf8").replaceAll(
      "\r\n",
      "\n"
    );
    const seeded = seedBenchmark(original, name);
    expect(seeded.replace(fixture.to, fixture.from)).toBe(original);
    expect(() => seedBenchmark(seeded, name)).toThrow("exactly once");
  }
});
