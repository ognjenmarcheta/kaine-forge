import { createLogger } from "@repo/logger";

import { createApiServer } from "./server";

const logger = createLogger({ name: "api" });
const port = Number(process.env.API_PORT ?? 4000);
const { server } = createApiServer({ logger });

server.listen(port, () => {
  logger.info({ port }, "api server started");
});
