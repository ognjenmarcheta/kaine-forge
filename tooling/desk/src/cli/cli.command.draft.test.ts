import { afterEach, describe, expect, it } from "vitest";

import { createCliEnv, type CliEnv } from "../testing/cli.testing";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

describe("draft", () => {
  it.each([
    ["--confirm without --apply", ["draft", "7", "--confirm"]],
    ["--apply with a snapshot file", ["draft", "7", "--apply", "--snapshot-file", "x.json"]],
    ["no issue number", ["draft"]]
  ])("is a usage error: %s", async (_name, argv) => {
    env = await createCliEnv();
    const result = await env.run(...argv);
    expect(result.code).toBe(2);
    expect(env.github.bodyEdits).toEqual([]);
  });
});
