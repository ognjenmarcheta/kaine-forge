import assert from "node:assert/strict";
import console from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

import * as counts from "./src/index.ts";
import { countForDisplay } from "./src/counts.consumer.ts";

const scenario = process.argv[2] ?? "baseline";
assert.ok(["baseline", "edit", "rename", "delete"].includes(scenario), "Unknown scenario");
const exportName = scenario === "rename" ? "normalizeCount" : "clampCount";
const helper = counts[exportName];
assert.equal(typeof helper, "function", "Required export is missing");
assert.equal(helper(-2), scenario === "edit" ? 0 : -2);
assert.equal(helper(0), 0);
assert.equal(helper(3), 3);
assert.equal(countForDisplay(-2), scenario === "edit" ? 0 : -2);
assert.equal(countForDisplay(3), 3);
assert.equal(counts.untouchedLabel, "clampCount sentinel");
assert.ok(
  readFileSync(new URL("./src/counts.util.ts", import.meta.url), "utf8").includes(
    "// Keep this comment and the clampCount sentinel unchanged during refactors."
  )
);
if (scenario === "rename") assert.equal("clampCount" in counts, false);
console.log(
  `${scenario}: export, consumers, negative/zero/positive inputs, and protected text passed`
);
