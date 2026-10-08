import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deskConfigSchema } from "../contracts";
import { loadDeskConfig } from "./config.load";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "desk-config-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writeConfig = async (content: string): Promise<string> => {
  const file = path.join(dir, "config.json");
  await writeFile(file, content);
  return file;
};

describe("loadDeskConfig", () => {
  it("returns the defaults when no path is given", async () => {
    expect(await loadDeskConfig()).toEqual({
      ok: true,
      source: "defaults",
      config: deskConfigSchema.parse({})
    });
  });

  it("returns the defaults when the optional file does not exist", async () => {
    const result = await loadDeskConfig(path.join(dir, "absent.json"));
    expect(result).toMatchObject({ ok: true, source: "defaults" });
  });

  it("layers the file over the defaults", async () => {
    const file = await writeConfig(
      JSON.stringify({ maxTestLoops: 5, providers: { reviewer: "claude" } })
    );
    const result = await loadDeskConfig(file);
    expect(result).toMatchObject({ ok: true, source: "file" });
    if (result.ok) {
      expect(result.config.maxTestLoops).toBe(5);
      expect(result.config.maxReviewLoops).toBe(2);
      expect(result.config.providers).toEqual({
        planner: "claude",
        builder: "claude",
        reviewer: "claude"
      });
    }
  });

  it("rejects an unknown key instead of ignoring it", async () => {
    const result = await loadDeskConfig(await writeConfig(JSON.stringify({ maxTestLoop: 5 })));
    expect(result).toMatchObject({ ok: false, reason: "invalid-config" });
    expect(!result.ok && result.detail).toContain("maxTestLoop");
  });

  it("names the field that fails validation", async () => {
    const result = await loadDeskConfig(
      await writeConfig(JSON.stringify({ providers: { planner: "gemini" } }))
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid-config" });
    expect(!result.ok && result.detail).toContain("providers.planner");
  });

  it("reports malformed JSON", async () => {
    expect(await loadDeskConfig(await writeConfig("{ nope"))).toMatchObject({
      ok: false,
      reason: "invalid-json"
    });
  });

  it("reports a path that cannot be read as a file", async () => {
    expect(await loadDeskConfig(dir)).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("rejects a file whose root is not an object", async () => {
    expect(await loadDeskConfig(await writeConfig("[]"))).toMatchObject({
      ok: false,
      reason: "invalid-config"
    });
  });
});
