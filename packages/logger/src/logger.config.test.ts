import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { resolveLoggerConfig } from "./logger.config";

function captureLogger(): { logger: pino.Logger; lines: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    }
  });
  const logger = pino(resolveLoggerConfig({ name: "redact-test", level: "info" }), stream);

  return { logger, lines: () => chunks.join("") };
}

describe("resolveLoggerConfig redaction", () => {
  it("never writes authorization, cookie, or set-cookie header values", () => {
    const { logger, lines } = captureLogger();

    logger.info(
      {
        req: { headers: { authorization: "Bearer req-token", cookie: "session=req-cookie" } },
        res: { headers: { "set-cookie": "session=res-cookie" } },
        headers: {
          authorization: "Bearer bare-token",
          cookie: "session=bare-cookie",
          "set-cookie": "session=bare-set-cookie"
        }
      },
      "headers"
    );

    const line: unknown = JSON.parse(lines());
    expect(line).toMatchObject({
      req: { headers: { authorization: "[redacted]", cookie: "[redacted]" } },
      res: { headers: { "set-cookie": "[redacted]" } },
      headers: {
        authorization: "[redacted]",
        cookie: "[redacted]",
        "set-cookie": "[redacted]"
      }
    });
  });
});
