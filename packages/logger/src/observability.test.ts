import { describe, expect, it, vi } from "vitest";

import { createErrorReporter } from "./observability";

describe("createErrorReporter", () => {
  it("is a no-op when observability is disabled", () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("ok", { status: 200 });
    };
    const reporter = createErrorReporter({ fetchImpl }, { NODE_ENV: "production" });

    reporter.captureException(new Error("boom"));
    expect(called).toBe(false);
  });

  it("posts when enabled with a DSN / ingest URL", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body ?? "");
      return new Response("ok", { status: 200 });
    };
    const reporter = createErrorReporter(
      {
        enabled: true,
        dsn: "https://ingest.example.test/hook",
        fetchImpl
      },
      {}
    );

    reporter.captureException(new Error("boom"), { requestId: "r1" });
    await vi.waitFor(() => expect(capturedUrl).toBe("https://ingest.example.test/hook"));
    expect(JSON.parse(capturedBody).message).toBe("boom");
    expect(JSON.parse(capturedBody).context).toEqual({ requestId: "r1" });
  });

  it("uses an injected reporter when provided", () => {
    const captureException = vi.fn();
    const reporter = createErrorReporter({ reporter: { captureException } });
    reporter.captureException(new Error("x"));
    expect(captureException).toHaveBeenCalledOnce();
  });
});
