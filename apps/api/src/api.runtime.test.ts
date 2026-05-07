import type { Logger } from "@repo/logger";
import { describe, expect, it, vi } from "vitest";

import { startApiRuntime } from "./api.runtime";

function logger(): Logger {
  return {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn()
  } as unknown as Logger;
}

describe("api runtime", () => {
  it("verifies dependencies, runs migrations, and starts the server", async () => {
    const listen = vi.fn((_port: number, callback: () => void) => callback());
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
