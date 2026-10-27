import type { Logger } from "@repo/logger";
import type { Disposable } from "graphql-ws";
import type { Server } from "node:http";
import type { WebSocketServer } from "ws";

export interface ApiShutdownAdapter {
  closePool: () => Promise<void>;
  exit: (code: number) => void;
  logger: Pick<Logger, "error" | "info" | "warn">;
  server: Server;
  // Each stopper runs when the signal arrives, alongside the connection drain,
  // and finishes before the pool ends. Register every background worker here.
  stopBackgroundWork: Array<() => void | Promise<void>>;
  subscriptions: Disposable;
  timeoutMs: number;
  wsServer: WebSocketServer;
}

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

export function registerApiShutdown(
  adapter: ApiShutdownAdapter,
  signals: Pick<NodeJS.EventEmitter, "on"> = process
): void {
  let shuttingDown = false;

  // server.close() closes only the sockets that are idle at that moment. A
  // request still in flight leaves its keep-alive socket open after the
  // response, so close it as soon as the response finishes.
  adapter.server.on("request", (_req, res) => {
    res.once("finish", () => {
      if (shuttingDown) adapter.server.closeIdleConnections();
    });
  });

  for (const signal of SHUTDOWN_SIGNALS) {
    signals.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void shutdown(adapter, signal);
    });
  }
}

async function shutdown(adapter: ApiShutdownAdapter, signal: NodeJS.Signals): Promise<void> {
  const { logger, server, wsServer } = adapter;
  logger.info({ signal }, "api server stopping");

  // Started synchronously, so the listener closes and the stoppers run before
  // the first await: no new connection or sweep tick slips in.
  const drain = (async () => {
    await Promise.all([
      ...adapter.stopBackgroundWork.map(async (stop) => stop()),
      // graphql-ws sends each client close code 1001 and closes the wsServer.
      adapter.subscriptions.dispose(),
      closeHttpServer(server)
    ]);
    await adapter.closePool();
  })();

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), adapter.timeoutMs);
  });

  try {
    const outcome = await Promise.race([drain.then(() => "drained" as const), timeout]);

    if (outcome === "timeout") {
      const openConnections = await countConnections(server);
      logger.warn(
        { openConnections, timeoutMs: adapter.timeoutMs },
        "api shutdown timed out; forcing open connections closed"
      );
      server.closeAllConnections();
      for (const client of wsServer.clients) client.terminate();
      adapter.exit(1);
      return;
    }
  } catch (error) {
    logger.error({ err: error }, "api shutdown failed");
    adapter.exit(1);
    return;
  } finally {
    clearTimeout(timer);
  }

  logger.info("api server stopped");
  adapter.exit(0);
}

// Node closes idle keep-alive sockets on close() and resolves once every
// in-flight request has finished.
function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function countConnections(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.getConnections((error, count) => resolve(error ? 0 : count));
  });
}
