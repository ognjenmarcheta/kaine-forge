import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONTENT_SECURITY_POLICY } from "./server.security";
import { contentTypeFor } from "./server.static";
import { WRITE_HEADERS, authenticated, createHarness, raw, type Harness } from "./server.testing";

const INDEX =
  '<!doctype html><html><head><title>desk</title></head><body><div id="root"></div></body></html>';

let base: Harness;
let ui: Harness;

beforeEach(async () => {
  base = await createHarness();
  const dir = path.join(base.root, "ui");
  await mkdir(path.join(dir, "assets", "nested"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), INDEX);
  await writeFile(path.join(dir, "assets", "app.js"), "console.log(1)");
  await writeFile(path.join(dir, "assets", "app.css"), "body{}");
  await writeFile(path.join(dir, "assets", "logo.svg"), "<svg/>");
  await writeFile(path.join(dir, "assets", "nested", "data.json"), "{}");
  await writeFile(path.join(base.root, "outside.txt"), "OUTSIDE");
  await symlink(path.join(base.root, "outside.txt"), path.join(dir, "assets", "leak.txt"));
  ui = await createHarness({ uiDir: dir });
});
afterEach(async () => {
  await ui.cleanup();
  await base.cleanup();
});

describe("static UI", () => {
  it("serves the index at the root without a session", async () => {
    const reply = await raw(ui.desk, { path: "/" });
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(reply.text).toBe(INDEX);
    expect(reply.headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(reply.headers["cache-control"]).toBe("no-store");
  });

  it.each([
    { file: "/assets/app.js", type: "text/javascript; charset=utf-8", body: "console.log(1)" },
    { file: "/assets/app.css", type: "text/css; charset=utf-8", body: "body{}" },
    { file: "/assets/logo.svg", type: "image/svg+xml", body: "<svg/>" },
    { file: "/assets/nested/data.json", type: "application/json; charset=utf-8", body: "{}" },
    { file: "/index.html", type: "text/html; charset=utf-8", body: INDEX }
  ])("serves $file as $type", async ({ file, type, body }) => {
    const reply = await raw(ui.desk, { path: file });
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe(type);
    expect(reply.headers["content-length"]).toBe(String(Buffer.byteLength(body)));
    expect(reply.text).toBe(body);
  });

  it("falls back to the index for a client-side route", async () => {
    for (const route of ["/issues/12", "/health", "/issues/12/plan"]) {
      const reply = await raw(ui.desk, { path: route });
      expect(reply.status, route).toBe(200);
      expect(reply.text).toBe(INDEX);
    }
  });

  it("answers 404 for a missing asset instead of the index", async () => {
    for (const route of ["/assets/missing.js", "/missing.css", "/assets/nested/none.json"]) {
      const reply = await raw(ui.desk, { path: route });
      expect(reply.status, route).toBe(404);
      expect(reply.json()).toEqual({ error: { code: "not-found", detail: null } });
    }
  });

  it("never lists a directory", async () => {
    for (const route of ["/assets", "/assets/", "/assets/nested/"]) {
      const reply = await raw(ui.desk, { path: route });
      expect(reply.text, route).not.toContain("app.js");
      expect(reply.text, route).not.toContain("nested");
      expect([200, 404]).toContain(reply.status);
    }
  });

  it("does not serve a link that leaves the directory", async () => {
    const reply = await raw(ui.desk, { path: "/assets/leak.txt" });
    expect(reply.status).toBe(404);
    expect(reply.text).not.toContain("OUTSIDE");
  });

  it("answers HEAD with headers and no body", async () => {
    const reply = await raw(ui.desk, { method: "HEAD", path: "/assets/app.js" });
    expect(reply.status).toBe(200);
    expect(reply.text).toBe("");
    expect(reply.headers["content-length"]).toBe("14");
  });

  it("answers 405 to a write on a static path", async () => {
    const reply = await raw(ui.desk, {
      method: "POST",
      path: "/",
      headers: WRITE_HEADERS(ui.desk),
      body: "{}"
    });
    expect(reply.status).toBe(405);
  });

  it("keeps the API reachable next to the UI", async () => {
    const api = await authenticated(ui);
    expect((await api.get("/api/issues")).status).toBe(200);
    expect((await raw(ui.desk, { path: "/api/issues" })).status).toBe(401);
  });

  it("answers 404 for every path when no UI directory is set", async () => {
    const reply = await raw(base.desk, { path: "/" });
    expect(reply.status).toBe(404);
    expect(reply.json()).toEqual({ error: { code: "not-found", detail: null } });
  });

  it("answers 404 when the UI directory does not exist", async () => {
    const missing = await createHarness({ uiDir: path.join(base.root, "not-built") });
    try {
      expect((await raw(missing.desk, { path: "/" })).status).toBe(404);
      expect((await raw(missing.desk, { path: "/assets/app.js" })).status).toBe(404);
    } finally {
      await missing.cleanup();
    }
  });

  it("maps file extensions to content types", () => {
    expect(contentTypeFor("a.woff2")).toBe("font/woff2");
    expect(contentTypeFor("A.PNG")).toBe("image/png");
    expect(contentTypeFor("a.unknown")).toBe("application/octet-stream");
    expect(contentTypeFor("noextension")).toBe("application/octet-stream");
  });
});
