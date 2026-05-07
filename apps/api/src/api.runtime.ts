import type { Logger } from "@repo/logger";

import type { resolveApiStartupConfig } from "./startup.config";

interface ApiRuntimeServer {
  listen: (port: number, callback: () => void) => void;
}

export interface ApiRuntimeAdapter {
  createServer: (input: { logger: Logger }) => { server: ApiRuntimeServer };
  exit: (code: number) => never;
  logger: Logger;
  migrations: {
    run: () => Promise<void>;
  };
  port: number;
  startupConfig: ReturnType<typeof resolveApiStartupConfig>;
  verifyDatabase: () => Promise<void>;
}

export async function startApiRuntime(adapter: ApiRuntimeAdapter): Promise<void> {
  try {
    await adapter.verifyDatabase();
    adapter.logger.info("database connection verified");
  } catch (error) {
    adapter.logger.error({ err: error }, "database connection failed");
    adapter.exit(1);
  }

  if (adapter.startupConfig.runMigrations) {
    try {
      await adapter.migrations.run();
      adapter.logger.info("database migrations applied");
    } catch (error) {
      adapter.logger.error({ err: error }, "database migrations failed");
      adapter.exit(1);
    }
  } else {
    adapter.logger.info("database migrations skipped");
  }

  const { server } = adapter.createServer({ logger: adapter.logger });

  server.listen(adapter.port, () => {
    adapter.logger.info({ port: adapter.port }, "api server started");
  });
}
