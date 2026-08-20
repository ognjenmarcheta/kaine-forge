import { createLogger, type Logger } from "@repo/logger";
import { describe, expect, it, vi } from "vitest";

import { startApiRuntime } from "./api.runtime";

type ListenFake = {
  (port: number, callback: () => void): void;
  (port: number, hostname: string, callback: () => void): void;
};

function logger(): Logger {
  const log = createLogger({ name: "api-runtime-test", level: "silent" });
  vi.spyOn(log, "info");
  return log;
}

describe("api runtime", () => {
  it("verifies dependencies, runs migrations, and starts the server", async () => {
    const listen = vi.fn((...args: [number, () => void] | [number, string, () => void]) => {
      const callback = typeof args[1] === "function" ? args[1] : args[2];
      if (!callback) throw new Error("missing listen callback");
      callback();
    }) as ListenFake;
    const log = logger();

    await startApiRuntime({
      createServer: () => ({
        server: {
          listen
        }
      }),
      exit: (code) => {
        throw new Error(`exit ${String(code)}`);
      },
      logger: log,
      migrations: {
        run: vi.fn(async () => undefined)
      },
      port: 4000,
      startupConfig: {
        runMigrations: true
      },
      verifyDatabase: vi.fn(async () => undefined)
    });

    expect(listen).toHaveBeenCalledWith(4000, expect.any(Function));
    expect(log.info).toHaveBeenCalledWith({ port: 4000 }, "api server started");
  });

  it("binds the server to the configured host when provided", async () => {
    const listen = vi.fn((...args: [number, () => void] | [number, string, () => void]) => {
      const callback = typeof args[1] === "function" ? args[1] : args[2];
      if (!callback) throw new Error("missing listen callback");
      callback();
    }) as ListenFake;
    const log = logger();

    await startApiRuntime({
      createServer: () => ({
        server: {
          listen
        }
      }),
      exit: (code) => {
        throw new Error(`exit ${String(code)}`);
      },
      host: "0.0.0.0",
      logger: log,
      migrations: {
        run: vi.fn(async () => undefined)
      },
      port: 4000,
      startupConfig: {
        runMigrations: false
      },
      verifyDatabase: vi.fn(async () => undefined)
    });

    expect(listen).toHaveBeenCalledWith(4000, "0.0.0.0", expect.any(Function));
    expect(log.info).toHaveBeenCalledWith({ host: "0.0.0.0", port: 4000 }, "api server started");
  });

  it("exits before server creation when database verification fails", async () => {
    const createServer = vi.fn();

    await expect(
      startApiRuntime({
        createServer,
        exit: (code) => {
          throw new Error(`exit ${String(code)}`);
        },
        logger: logger(),
        migrations: {
          run: vi.fn(async () => undefined)
        },
        port: 4000,
        startupConfig: {
          runMigrations: true
        },
        verifyDatabase: vi.fn(async () => {
          throw new Error("db down");
        })
      })
    ).rejects.toThrowError("exit 1");
    expect(createServer).not.toHaveBeenCalled();
  });
});
