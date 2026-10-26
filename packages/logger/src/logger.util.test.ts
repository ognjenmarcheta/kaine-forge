import { describe, expect, it } from "vitest";

import { createChildLogger, createLogger } from "./logger.util";

describe("logger", () => {
  it("creates a logger with the given name", () => {
    const logger = createLogger({ name: "test-app", level: "silent" });

    // pino serializes these bindings into every log line, so the name reaches output.
    expect(logger.bindings()["name"]).toBe("test-app");
  });

  it("respects an explicit log level", () => {
    const logger = createLogger({ name: "test-app", level: "warn" });

    expect(logger.level).toBe("warn");
  });

  it("defaults to silent in test environment", () => {
    const logger = createLogger({ name: "test-app" });

    expect(logger.level).toBe("silent");
  });

  it("attaches static bindings via options", () => {
    const logger = createLogger({
      name: "test-app",
      level: "silent",
      bindings: { service: "auth" }
    });

    expect(logger.bindings()["service"]).toBe("auth");
  });

  it("creates a child logger that merges bindings", () => {
    const parent = createLogger({
      name: "test-app",
      level: "silent",
      bindings: { service: "api" }
    });

    const child = createChildLogger(parent, { requestId: "abc-123" });
    const childBindings = child.bindings();

    expect(childBindings["service"]).toBe("api");
    expect(childBindings["requestId"]).toBe("abc-123");
  });

  it("child logger inherits parent log level", () => {
    const parent = createLogger({ name: "test-app", level: "warn" });
    const child = createChildLogger(parent, { component: "db" });

    expect(child.level).toBe("warn");
  });
});
