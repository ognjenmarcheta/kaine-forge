import { afterEach, describe, expect, it } from "vitest";

import type { CliDeps } from "./cli.types";
import { createCliEnv, type CliEnv } from "../testing/cli.testing";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

type ServeOptions = Parameters<NonNullable<CliDeps["serve"]>>[0];

const open = async (serve: NonNullable<CliDeps["serve"]>): Promise<CliEnv> => {
  env = await createCliEnv({ deps: { serve } });
  return env;
};

describe("serve", () => {
  it("starts the server on a free port and opens the browser by default", async () => {
    const calls: ServeOptions[] = [];
    const e = await open((options) => {
      calls.push(options);
      options.print?.("Agent desk: http://127.0.0.1:4000/\n");
      return Promise.resolve();
    });
    const result = await e.run("serve");
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toContain("Agent desk: http://127.0.0.1:4000/");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ port: undefined, open: true, cwd: e.repo });
  });

  it("passes --port and --no-open", async () => {
    const calls: ServeOptions[] = [];
    const e = await open((options) => {
      calls.push(options);
      return Promise.resolve();
    });
    expect((await e.run("serve", "--port", "4321", "--no-open")).code).toBe(0);
    expect(calls[0]).toMatchObject({ port: 4321, open: false });
    expect((await e.run("serve", "--port", "0")).code).toBe(0);
    expect(calls[1]).toMatchObject({ port: 0, open: true });
  });

  it("runs until the signal ends it, then exits 0", async () => {
    const controller = new AbortController();
    env = await createCliEnv({
      deps: {
        signal: controller.signal,
        serve: (options) =>
          new Promise<void>((resolve) => {
            options.signal?.addEventListener("abort", () => resolve(), { once: true });
          })
      }
    });
    let finished = false;
    const running = env.run("serve", "--no-open").then((result) => {
      finished = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(finished).toBe(false);
    controller.abort();
    expect(await running).toMatchObject({ code: 0, stderr: "" });
  });

  it("exits 1 with the reason when the server cannot start", async () => {
    const e = await open(() => Promise.reject(new Error("listen EADDRINUSE: address in use")));
    const result = await e.run("serve", "--port", "4321");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: listen EADDRINUSE");
  });
});
