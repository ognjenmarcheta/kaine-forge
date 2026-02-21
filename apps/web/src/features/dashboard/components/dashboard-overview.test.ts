import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "dashboard-overview.tsx");
const source = readFileSync(sourcePath, "utf8");

describe("DashboardOverview implementation contract", () => {
  it("uses shared Card primitives from @repo/ui", () => {
    expect(source).toContain('from "@repo/ui"');
    expect(source).toContain("Card");
    expect(source).toContain("CardHeader");
    expect(source).toContain("CardTitle");
    expect(source).toContain("CardDescription");
  });

  it("does not render manual article cards", () => {
    expect(source).not.toContain("<article");
  });
});
