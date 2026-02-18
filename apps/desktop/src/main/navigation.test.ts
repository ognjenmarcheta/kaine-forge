import { describe, expect, it } from "vitest";

import { normalizeBaseRendererUrl, resolveDesktopRouteUrl } from "./navigation";

describe("navigation", () => {
  it("resolves route URLs for http targets", () => {
    expect(resolveDesktopRouteUrl("http://localhost:3000", "dashboard")).toBe(
      "http://localhost:3000/dashboard"
    );
    expect(resolveDesktopRouteUrl("http://localhost:3000", "todos")).toBe(
      "http://localhost:3000/todos"
    );
  });

  it("uses hash routing for file targets", () => {
    expect(resolveDesktopRouteUrl("file:///apps/web/dist/index.html", "dashboard")).toBe(
      "file:///apps/web/dist/index.html#/dashboard"
    );
  });

  it("falls back to localhost for invalid base URLs", () => {
    expect(normalizeBaseRendererUrl("not-a-url")).toBe("http://localhost:3000");
    expect(normalizeBaseRendererUrl(undefined)).toBe("http://localhost:3000");
  });
});
