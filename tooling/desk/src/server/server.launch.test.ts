import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PipelineEventListener } from "./server.events";
import {
  browserOpenCommand,
  launchDeskServer,
  serveDesk,
  type DeskRuntime,
  type DeskRuntimeFactory
} from "./server.launch";
import { login, makeFakeRunner, makeState, okDoctor, raw } from "./server.testing";
import { createIssueStore } from "../store/store.issue";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const fakeRuntime = async (): Promise<{
  readonly factory: DeskRuntimeFactory;
  readonly dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly emitted: () => PipelineEventListener | null;
  readonly runtime: DeskRuntime;
}> => {
  const root = await mkdtemp(path.join(tmpdir(), "desk-launch-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const dispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const runtime: DeskRuntime = {
    runner: makeFakeRunner(),
    store: createIssueStore(path.join(root, "state")),
    health: () => Promise.resolve(okDoctor),
    dispose
  };
  let emitter: PipelineEventListener | null = null;
  return {
    factory: (onEvent) => {
      emitter = onEvent;
      return Promise.resolve(runtime);
    },
    dispose,
    emitted: () => emitter,
    runtime
  };
};

describe("launchDeskServer", () => {
  it("prints the launch URL with the token in the fragment and serves the API", async () => {
    const { factory } = await fakeRuntime();
    const printed: string[] = [];
    const desk = await launchDeskServer({
      depsFactory: factory,
      print: (text) => printed.push(text)
    });
    cleanups.push(() => desk.close());

    const url =
      printed
        .find((line) => line.startsWith("Agent desk: "))
        ?.slice(12)
        .trim() ?? "";
    expect(url).toBe(desk.launchUrl);
    expect(new URL(url).hash).toMatch(/^#session=[0-9a-f]{64}$/);
    expect(new URL(url).hostname).toBe("127.0.0.1");
    expect(printed.join("")).not.toMatch(/\?session=|\/session\//);

    const token = new URLSearchParams(new URL(url).hash.slice(1)).get("session") ?? "";
    const cookie = await login({ desk, token });
    const reply = await raw(desk, { path: "/api/health", headers: { Cookie: cookie } });
    expect(reply.status).toBe(200);
  });

  it("uses the requested port", async () => {
    const { factory } = await fakeRuntime();
    const probe = await launchDeskServer({ depsFactory: factory, print: () => undefined });
    const { port } = new URL(probe.url);
    await probe.close();

    const { factory: second } = await fakeRuntime();
    const desk = await launchDeskServer({
      depsFactory: second,
      port: Number(port),
      print: () => undefined
    });
    cleanups.push(() => desk.close());
    expect(new URL(desk.url).port).toBe(port);
  });

  it("opens the browser only when asked", async () => {
    const quiet = await fakeRuntime();
    const opened: string[] = [];
    const first = await launchDeskServer({
      depsFactory: quiet.factory,
      print: () => undefined,
      openBrowser: (url) => opened.push(url)
    });
    cleanups.push(() => first.close());
    expect(opened).toEqual([]);

    const loud = await fakeRuntime();
    const second = await launchDeskServer({
      depsFactory: loud.factory,
      open: true,
      print: () => undefined,
      openBrowser: (url) => opened.push(url)
    });
    cleanups.push(() => second.close());
    expect(opened).toEqual([second.launchUrl]);
  });

  it("gives the factory the pipeline's event sink and shows what it emits in the log", async () => {
    const fake = await fakeRuntime();
    const desk = await launchDeskServer({ depsFactory: fake.factory, print: () => undefined });
    cleanups.push(() => desk.close());
    await fake.runtime.store.write(makeState(5));
    const token = new URLSearchParams(new URL(desk.launchUrl).hash.slice(1)).get("session") ?? "";
    const cookie = await login({ desk, token });

    fake.emitted()?.({ type: "log", issue: 5, message: "hello from the pipeline" });
    const reply = await raw(desk, { path: "/api/issues/5/log", headers: { Cookie: cookie } });
    expect(reply.text).toContain("hello from the pipeline");
  });

  it("serves the UI directory the caller names", async () => {
    const fake = await fakeRuntime();
    const uiDir = await mkdtemp(path.join(tmpdir(), "desk-ui-"));
    cleanups.push(() => rm(uiDir, { recursive: true, force: true }));
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path.join(uiDir, "index.html"), "<title>ui</title>")
    );
    const desk = await launchDeskServer({
      depsFactory: fake.factory,
      uiDir,
      print: () => undefined
    });
    cleanups.push(() => desk.close());
    expect((await raw(desk, { path: "/" })).text).toBe("<title>ui</title>");
  });

  it("serves only the API for uiDir null, even when the runtime knows a UI", async () => {
    const fake = await fakeRuntime();
    const desk = await launchDeskServer({
      depsFactory: (onEvent) =>
        fake.factory(onEvent).then((runtime) => ({ ...runtime, uiDir: "/does/not/matter" })),
      uiDir: null,
      print: () => undefined
    });
    cleanups.push(() => desk.close());
    expect((await raw(desk, { path: "/" })).status).toBe(404);
  });

  it("disposes the runtime when the server closes", async () => {
    const fake = await fakeRuntime();
    const desk = await launchDeskServer({ depsFactory: fake.factory, print: () => undefined });
    await desk.close();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(desk.runtime).toBe(fake.runtime);
  });

  it("starts nothing when the runtime cannot be built", async () => {
    const printed: string[] = [];
    await expect(
      launchDeskServer({
        depsFactory: () => Promise.reject(new Error("Config error (invalid-config): bad")),
        print: (text) => printed.push(text)
      })
    ).rejects.toThrow("Config error");
    expect(printed).toEqual([]);
  });

  it("disposes the runtime when the port is taken", async () => {
    const first = await fakeRuntime();
    const holder = await launchDeskServer({ depsFactory: first.factory, print: () => undefined });
    cleanups.push(() => holder.close());

    const second = await fakeRuntime();
    await expect(
      launchDeskServer({
        depsFactory: second.factory,
        port: Number(new URL(holder.url).port),
        print: () => undefined
      })
    ).rejects.toThrow();
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("serveDesk", () => {
  it("serves until the signal aborts and then closes", async () => {
    const fake = await fakeRuntime();
    const printed: string[] = [];
    const controller = new AbortController();
    const served = serveDesk({
      depsFactory: fake.factory,
      print: (text) => printed.push(text),
      signal: controller.signal
    });
    await vi.waitFor(() => expect(printed.join("")).toContain("Agent desk: http://127.0.0.1:"));
    const url = printed.join("").match(/Agent desk: (\S+)/)?.[1] ?? "";
    controller.abort();
    await served;
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await expect(fetch(new URL(url).origin)).rejects.toThrow();
  });

  it("returns at once for a signal that is already aborted", async () => {
    const fake = await fakeRuntime();
    const controller = new AbortController();
    controller.abort();
    await serveDesk({
      depsFactory: fake.factory,
      print: () => undefined,
      signal: controller.signal
    });
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("browserOpenCommand", () => {
  const hostile = "http://127.0.0.1:1234/#session=abc;rm -rf ~&&echo $(whoami)";

  it.each([
    { platform: "darwin" as const, command: "open", args: [hostile] },
    { platform: "linux" as const, command: "xdg-open", args: [hostile] },
    {
      platform: "win32" as const,
      command: "rundll32",
      args: ["url.dll,FileProtocolHandler", hostile]
    }
  ])(
    "opens with $command on $platform as an argv, never a shell string",
    ({ platform, command, args }) => {
      const result = browserOpenCommand(hostile, platform);
      expect(result).toEqual({ command, args });
      expect(["sh", "bash", "cmd", "powershell"]).not.toContain(result.command);
      expect(result.args).toContain(hostile);
    }
  );
});
