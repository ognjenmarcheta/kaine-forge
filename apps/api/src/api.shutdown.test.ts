import { createLogger, type Logger } from "@repo/logger";
import { buildSchema } from "graphql";
import { useServer } from "graphql-ws/use/ws";
import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { registerApiShutdown } from "./api.shutdown";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function logger(): Logger {
  const log = createLogger({ name: "api-shutdown-test", level: "silent" });
  vi.spyOn(log, "info");
  vi.spyOn(log, "warn");
  return log;
}

// A real HTTP server with the same graphql-ws wiring as createApiServer, so the
// drain runs against real sockets, keep-alive, and close frames.
async function startServer(handler: Handler) {
  const server = createServer(handler);
  const wsServer = new WebSocketServer({ server, path: "/graphql" });
  const subscriptions = useServer({ schema: buildSchema("type Query { ok: String }") }, wsServer);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanups.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to listen on a port");
  }
  return { server, wsServer, subscriptions, port: address.port };
}

function exitSpy() {
  let resolveExit: (code: number) => void = () => undefined;
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  return { exit: vi.fn((code: number) => resolveExit(code)), exited };
}

function refusesConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

describe("api shutdown", () => {
  it("drains in-flight requests, closes subscriptions, then ends the pool once", async () => {
    let requestArrived: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      requestArrived = resolve;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { server, wsServer, subscriptions, port } = await startServer((_req, res) => {
      requestArrived();
      void released.then(() => res.end("done"));
    });

    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/graphql`, "graphql-transport-ws");
    await new Promise((resolve) => client.once("open", resolve));
    const closeCode = new Promise<number>((resolve) => client.once("close", resolve));

    const log = logger();
    const { exit, exited } = exitSpy();
    const stopSweep = vi.fn();
    const closePool = vi.fn(async () => {
      expect(server.listening).toBe(false);
      expect(wsServer.clients.size).toBe(0);
    });
    const signals = new EventEmitter();
    registerApiShutdown(
      {
        closePool,
        exit,
        logger: log,
        server,
        stopBackgroundWork: [stopSweep],
        subscriptions,
        // Below the 3 s idle timeout of the fetch client, so a keep-alive socket
        // left open after the in-flight response fails the drain.
        timeoutMs: 1000,
        wsServer
      },
      signals
    );

    const inFlight = fetch(`http://127.0.0.1:${String(port)}/`);
    await arrived;
    signals.emit("SIGTERM");
    signals.emit("SIGINT");

    expect(stopSweep).toHaveBeenCalledOnce();
    expect(await refusesConnection(port)).toBe(true);

    release();
    const response = await inFlight;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("done");
    expect(await closeCode).toBe(1001);

    expect(await exited).toBe(0);
    expect(closePool).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith("api server stopped");
  });

  it("force-closes connections and exits 1 when the drain outlasts the timeout", async () => {
    const { server, wsServer, subscriptions, port } = await startServer(() => {
      // Never responds.
    });
    const log = logger();
    const { exit, exited } = exitSpy();
    const signals = new EventEmitter();
    registerApiShutdown(
      {
        closePool: vi.fn(async () => undefined),
        exit,
        logger: log,
        server,
        stopBackgroundWork: [],
        subscriptions,
        timeoutMs: 50,
        wsServer
      },
      signals
    );

    const hung = fetch(`http://127.0.0.1:${String(port)}/`);
    const outcome = hung.then(
      () => "responded",
      () => "aborted"
    );
    await vi.waitFor(async () => {
      const open = await new Promise<number>((resolve) => {
        server.getConnections((_error, count) => resolve(count));
      });
      expect(open).toBe(1);
    });
    signals.emit("SIGTERM");

    expect(await exited).toBe(1);
    expect(await outcome).toBe("aborted");
    expect(log.warn).toHaveBeenCalledWith(
      { openConnections: 1, timeoutMs: 50 },
      "api shutdown timed out; forcing open connections closed"
    );
  });
});
