import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createCliEnv, type CliEnv } from "../testing/cli.testing";
import { snapshotOf } from "../testing/github.fake";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const FULL = [
  "## Outcome",
  "Reports export as CSV.",
  "## Acceptance criteria",
  "- The export button downloads a CSV",
  "## Scope",
  "apps/web",
  "## Validation",
  "pnpm check",
  "## Evidence",
  "apps/web/src/reports.tsx:12",
  "## Out of scope",
  "- None"
].join("\n");

describe("contract", () => {
  it("passes a body file in the issue format", async () => {
    env = await createCliEnv();
    await writeFile(path.join(env.repo, "body.md"), FULL);
    expect(await env.run("contract", "--file", "body.md")).toMatchObject({
      code: 0,
      stdout: "contract 6/6\nacceptance criteria: 1\nIntake reads the full contract.\n"
    });
  });

  it("fails an issue whose headings intake does not know, without printing its text", async () => {
    const body =
      "## Removal trigger and acceptance\n- Remove the exception\n## Exposure\nsecret detail";
    env = await createCliEnv({ github: { snapshot: snapshotOf({ number: 457, body }) } });

    const result = await env.run("contract", "457");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("contract 0/6");
    expect(result.stdout).toContain("Intake stops: no acceptance criteria.");
    expect(result.stdout).not.toContain("secret detail");
  });

  it("needs exactly one of an issue number and a file", async () => {
    env = await createCliEnv();
    expect((await env.run("contract")).code).toBe(2);
    expect((await env.run("contract", "7", "--file", "x.md")).code).toBe(2);
  });
});
