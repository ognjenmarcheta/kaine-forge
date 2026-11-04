import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopInstallers } from "./release-desktop-apps.mjs";

describe("release-desktop-apps", () => {
  it("lists only tagged desktop apps, with the workspace that bundles them", () => {
    const tags = "@repo/api@3.1.0\n@repo/desktop@1.3.0\n@repo/web@2.0.0\n";
    assert.deepEqual(desktopInstallers(tags), [
      { app: "desktop", workspace: "@repo/desktop", version: "1.3.0", tag: "@repo/desktop@1.3.0" }
    ]);
  });

  it("is empty for a version-PR commit without tags", () => {
    assert.deepEqual(desktopInstallers(""), []);
  });
});
