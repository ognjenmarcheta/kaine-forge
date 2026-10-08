import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DESK_REQUEST_HEADER } from "../contracts";
import { CONTENT_SECURITY_POLICY, constantTimeEqual } from "./server.security";
import {
  SAME_ORIGIN,
  WRITE_HEADERS,
  authenticated,
  createHarness,
  login,
  raw,
  type Harness
} from "./server.testing";

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});
afterEach(async () => {
  await harness.cleanup();
});

const expectSecurityHeaders = (headers: Record<string, string | string[] | undefined>): void => {
  expect(headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["x-frame-options"]).toBe("DENY");
};

describe("launch URL and token", () => {
  it("binds to loopback and puts the token in the fragment only", () => {
    const url = new URL(harness.desk.launchUrl);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/");
    expect(url.hash).toMatch(/^#session=[0-9a-f]{64}$/);
    expect(harness.desk.url).toBe(`http://127.0.0.1:${url.port}`);
    expect(harness.desk.url).not.toContain(harness.token);
    const address = harness.desk.server.address();
    expect(address).toMatchObject({ address: "127.0.0.1" });
  });

  it("picks a random free port by default", async () => {
    const other = await createHarness();
    try {
      expect(other.desk.url).not.toBe(harness.desk.url);
    } finally {
      await other.cleanup();
    }
  });

  it("trades the token for an HttpOnly SameSite=Strict cookie", async () => {
    const reply = await raw(harness.desk, {
      method: "POST",
      path: "/api/session",
      headers: WRITE_HEADERS(harness.desk),
      body: JSON.stringify({ token: harness.token })
    });
    expect(reply.status).toBe(200);
    const cookie = reply.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^desk_session_[0-9a-f]{16}=[0-9a-f]{64};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain(harness.token);
    expectSecurityHeaders(reply.headers);
  });

  it("accepts the token once: a second exchange fails even with the right token", async () => {
    await login(harness);
    const again = await raw(harness.desk, {
      method: "POST",
      path: "/api/session",
      headers: WRITE_HEADERS(harness.desk),
      body: JSON.stringify({ token: harness.token })
    });
    expect(again.status).toBe(403);
    expect(again.json()).toEqual({ error: { code: "forbidden", detail: expect.any(String) } });
    expect(again.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses a wrong token and keeps the real one valid", async () => {
    const wrong = await raw(harness.desk, {
      method: "POST",
      path: "/api/session",
      headers: WRITE_HEADERS(harness.desk),
      body: JSON.stringify({ token: "0".repeat(64) })
    });
    expect(wrong.status).toBe(403);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
    await expect(login(harness)).resolves.toMatch(/^desk_session_/);
  });

  it.each([
    { name: "an empty token", body: { token: "" } },
    { name: "no token", body: {} },
    { name: "an extra field", body: { token: "x", extra: true } }
  ])("rejects $name with 400", async ({ body }) => {
    const reply = await raw(harness.desk, {
      method: "POST",
      path: "/api/session",
      headers: WRITE_HEADERS(harness.desk),
      body: JSON.stringify(body)
    });
    expect(reply.status).toBe(400);
  });

  it("compares secrets in constant time and across lengths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("session cookie", () => {
  it.each(["/api/health", "/api/issues", "/api/events", "/api/issues/1"])(
    "protects GET %s",
    async (route) => {
      const reply = await raw(harness.desk, { path: route });
      expect(reply.status).toBe(401);
      expect(reply.json()).toEqual({ error: { code: "unauthorized", detail: expect.any(String) } });
    }
  );

  it("refuses a made-up cookie", async () => {
    const reply = await raw(harness.desk, {
      path: "/api/health",
      headers: { Cookie: `desk_session_0000000000000000=${"a".repeat(64)}` }
    });
    expect(reply.status).toBe(401);
  });

  it("refuses an actions request without the cookie", async () => {
    await harness.seed(1);
    const reply = await raw(harness.desk, {
      method: "POST",
      path: "/api/issues/1/actions",
      headers: WRITE_HEADERS(harness.desk),
      body: JSON.stringify({ action: "approve" })
    });
    expect(reply.status).toBe(401);
    expect(harness.runner.approvePlan).not.toHaveBeenCalled();
  });
});

describe("Host and Origin", () => {
  it.each([
    { name: "another host name", host: "evil.example" },
    { name: "another host with the port", host: "evil.example:80" },
    { name: "a rebinding name on the right port", host: "rebind.example:PORT" },
    { name: "loopback on another port", host: "127.0.0.1:1" }
  ])("rejects $name", async ({ host }) => {
    const port = new URL(harness.desk.url).port;
    const api = await authenticated(harness);
    for (const route of ["/api/health", "/"]) {
      const reply = await raw(harness.desk, {
        path: route,
        headers: { Host: host.replace("PORT", port), Cookie: api.cookie }
      });
      expect(reply.status).toBe(403);
      expect(reply.json()).toEqual({ error: { code: "forbidden", detail: expect.any(String) } });
    }
  });

  it("allows the loopback host names of the listener", async () => {
    const port = new URL(harness.desk.url).port;
    const api = await authenticated(harness);
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      const reply = await raw(harness.desk, {
        path: "/api/issues",
        headers: { Host: host, Cookie: api.cookie }
      });
      expect(reply.status).toBe(200);
    }
  });

  it.each([
    "https://evil.example",
    "http://127.0.0.1:1",
    "http://evil.example",
    "null",
    "http://127.0.0.1"
  ])("rejects Origin %s on a read", async (origin) => {
    const api = await authenticated(harness);
    const reply = await api.get("/api/issues", { Origin: origin });
    expect(reply.status).toBe(403);
  });

  it("rejects a cross-site fetch by Sec-Fetch-Site", async () => {
    const api = await authenticated(harness);
    const reply = await api.get("/api/issues", { "Sec-Fetch-Site": "cross-site" });
    expect(reply.status).toBe(403);
    const same = await api.get("/api/issues", { "Sec-Fetch-Site": "same-origin" });
    expect(same.status).toBe(200);
  });

  it("rejects a write from another origin even with the cookie and header", async () => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await api.post(
      "/api/issues/1/actions",
      { action: "approve" },
      {
        Origin: "https://evil.example"
      }
    );
    expect(reply.status).toBe(403);
    expect(harness.runner.approvePlan).not.toHaveBeenCalled();
  });
});

describe("writes need a header, an Origin and JSON", () => {
  it("rejects a write without Origin", async () => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await raw(harness.desk, {
      method: "POST",
      path: "/api/issues/1/actions",
      headers: {
        Cookie: api.cookie,
        [DESK_REQUEST_HEADER]: "1",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "approve" })
    });
    expect(reply.status).toBe(403);
  });

  it.each([
    { name: "missing", headers: {} as Record<string, string> },
    { name: "wrong", headers: { [DESK_REQUEST_HEADER]: "0" } }
  ])("rejects a write whose $name custom header", async ({ headers }) => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await raw(harness.desk, {
      method: "POST",
      path: "/api/issues/1/actions",
      headers: {
        ...SAME_ORIGIN(harness.desk),
        Cookie: api.cookie,
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({ action: "approve" })
    });
    expect(reply.status).toBe(403);
    expect(harness.runner.approvePlan).not.toHaveBeenCalled();
  });

  it.each([
    { name: "text/plain", type: "text/plain" },
    { name: "form data", type: "application/x-www-form-urlencoded" },
    { name: "JSON with another charset", type: "application/json; charset=latin1" },
    { name: "a look-alike type", type: "application/jsonp" }
  ])("rejects $name with 415", async ({ type }) => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await api.post(
      "/api/issues/1/actions",
      { action: "approve" },
      {
        "Content-Type": type
      }
    );
    expect(reply.status).toBe(415);
    expect(harness.runner.approvePlan).not.toHaveBeenCalled();
  });

  it("accepts JSON with an explicit utf-8 charset", async () => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await api.post(
      "/api/issues/1/actions",
      { action: "approve" },
      {
        "Content-Type": "application/json; charset=utf-8"
      }
    );
    expect(reply.status).toBe(200);
  });

  it("rejects a body past the limit by Content-Length", async () => {
    const small = await createHarness({ maxBodyBytes: 256 });
    try {
      const api = await authenticated(small);
      const reply = await api.post("/api/issues/1/actions", {
        action: "feedback",
        to: "build",
        text: "x".repeat(1000)
      });
      expect(reply.status).toBe(413);
      expect(reply.json()).toEqual({ error: { code: "payload-too-large", detail: null } });
      expect(small.runner.feedback).not.toHaveBeenCalled();
    } finally {
      await small.cleanup();
    }
  });

  it("rejects a streamed body past the limit without Content-Length", async () => {
    const small = await createHarness({ maxBodyBytes: 1024 });
    try {
      const api = await authenticated(small);
      const reply = await raw(small.desk, {
        method: "POST",
        path: "/api/session",
        headers: { ...WRITE_HEADERS(small.desk), Cookie: api.cookie },
        body: Buffer.alloc(200_000, 0x61),
        chunked: true
      });
      expect(reply.status).toBe(413);
    } finally {
      await small.cleanup();
    }
  });

  it("rejects a body that is not JSON with 400", async () => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await raw(harness.desk, {
      method: "POST",
      path: "/api/issues/1/actions",
      headers: { ...WRITE_HEADERS(harness.desk), Cookie: api.cookie },
      body: "{not json"
    });
    expect(reply.status).toBe(400);
    expect(reply.json()).toEqual({ error: { code: "bad-request", detail: expect.any(String) } });
  });

  it.each(["PUT", "DELETE", "PATCH"])("answers 405 to %s on a known route", async (method) => {
    const api = await authenticated(harness);
    const reply = await raw(harness.desk, {
      method,
      path: "/api/issues",
      headers: { ...WRITE_HEADERS(harness.desk), Cookie: api.cookie },
      body: "{}"
    });
    expect(reply.status).toBe(405);
  });

  it("answers 405 when an action route is read, and when a read route is written", async () => {
    const api = await authenticated(harness);
    expect((await api.get("/api/issues/1/actions")).status).toBe(405);
    expect((await api.post("/api/health", {})).status).toBe(405);
  });
});

describe("response headers", () => {
  it("sets the security headers on JSON, errors, artifacts and the event stream", async () => {
    await harness.seed(1);
    await harness.artifact(1, "ticket.md", "# Ticket");
    const api = await authenticated(harness);
    for (const route of [
      "/api/health",
      "/api/issues",
      "/api/issues/1/artifacts/ticket",
      "/api/nope",
      "/"
    ]) {
      expectSecurityHeaders((await api.get(route)).headers);
    }
    expectSecurityHeaders((await raw(harness.desk, { path: "/api/health" })).headers);
  });

  it("uses a CSP that allows no inline script and no framing", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-inline");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
  });
});

describe("request targets and traversal", () => {
  it.each(["//evil.example/api/health", "/api\\issues", "http://evil.example/api/health"])(
    "rejects the malformed target %s",
    async (target) => {
      const api = await authenticated(harness);
      const reply = await api.get(target);
      expect(reply.status).toBe(400);
    }
  );

  it.each([
    "/api/issues/0",
    "/api/issues/-1",
    "/api/issues/01",
    "/api/issues/1e3",
    "/api/issues/1.5",
    "/api/issues/%31",
    "/api/issues/9999999999",
    "/api/issues/abc",
    "/api/issues/1/unknown",
    "/api/issues/1/artifacts",
    "/api/issues/1/artifacts/plan/extra",
    "/api/unknown"
  ])("answers 404 to %s", async (route) => {
    await harness.seed(1);
    const api = await authenticated(harness);
    const reply = await api.get(route);
    expect(reply.status).toBe(404);
  });

  it("never reads a path the client names for an artifact", async () => {
    const outside = path.join(harness.root, "secret.txt");
    await writeFile(outside, "TOP SECRET");
    await harness.seed(1);
    await harness.artifact(1, "ticket.md", "# Ticket");
    const api = await authenticated(harness);
    for (const name of [
      "..%2f..%2f..%2fsecret.txt",
      "%2e%2e%2fsecret.txt",
      "..%2fstate.json",
      "state.json",
      "state",
      "ticket.md",
      "ticket%00",
      "plan.json",
      "diff.patch",
      "events.jsonl",
      "TICKET",
      "%2fetc%2fpasswd"
    ]) {
      const reply = await api.get(`/api/issues/1/artifacts/${name}`);
      expect(reply.status, name).toBe(404);
      expect(reply.text).not.toContain("TOP SECRET");
      expect(reply.json()).toEqual({ error: { code: "not-found", detail: null } });
    }
  });

  it("does not follow a symbolic link planted as an artifact", async () => {
    const outside = path.join(harness.root, "secret.txt");
    await writeFile(outside, "TOP SECRET");
    await harness.seed(1);
    await mkdir(harness.store.artifactsDir(1), { recursive: true });
    await symlink(outside, path.join(harness.store.artifactsDir(1), "diff.patch"));
    const api = await authenticated(harness);
    const reply = await api.get("/api/issues/1/artifacts/diff");
    expect(reply.status).toBe(404);
    expect(reply.text).not.toContain("TOP SECRET");
    const detail = (await api.get("/api/issues/1")).json() as {
      artifacts: { id: string; present: boolean }[];
    };
    expect(detail.artifacts.find((entry) => entry.id === "diff")?.present).toBe(false);
  });
});

describe("static files stay inside the UI directory", () => {
  it("serves no file outside uiDir by path tricks or links", async () => {
    const base = path.join(harness.root, "ui");
    await mkdir(path.join(base, "assets"), { recursive: true });
    await writeFile(path.join(base, "index.html"), "<!doctype html><title>desk</title>");
    await writeFile(path.join(base, "assets", "app.js"), "console.log('app')");
    await writeFile(path.join(harness.root, "secret.txt"), "TOP SECRET");
    await symlink(path.join(harness.root, "secret.txt"), path.join(base, "assets", "link.txt"));
    await symlink(harness.root, path.join(base, "assets", "up"));

    const served = await createHarness({ uiDir: base });
    try {
      for (const target of [
        "/..%2fsecret.txt",
        "/%2e%2e/secret.txt",
        "/assets/..%2f..%2fsecret.txt",
        "/assets/%2e%2e%2f%2e%2e%2fsecret.txt",
        "/../secret.txt",
        "/assets/../../secret.txt",
        "/assets/link.txt",
        "/assets/up/secret.txt",
        "/secret.txt",
        "/%00",
        "/assets%5c..%5csecret.txt",
        "/assets/%252e%252e/secret.txt"
      ]) {
        const reply = await raw(served.desk, { path: target });
        expect(reply.text, target).not.toContain("TOP SECRET");
        expect([400, 404], target).toContain(reply.status);
      }
      const asset = await raw(served.desk, { path: "/assets/app.js" });
      expect(asset.status).toBe(200);
    } finally {
      await served.cleanup();
    }
  });
});
