import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Rust side of this workspace has its own gates (cargo fmt, clippy, test).
// This test keeps the pnpm side honest: the scripts Turbo runs must target this
// crate alone with a locked dependency graph, and the crate must sit in the root
// workspace with the shared lint policy (MONOREPO_GUIDE.md §14, ADR 0025).
const read = (url: URL): string => readFileSync(url, "utf8");
const packageJson = JSON.parse(read(new URL("../package.json", import.meta.url))) as {
  scripts: Record<string, string>;
};
const crateManifest = read(new URL("../Cargo.toml", import.meta.url));
const workspaceManifest = read(new URL("../../../Cargo.toml", import.meta.url));

describe("@repo/desktop-native workspace contract", () => {
  it("runs every cargo script against this crate only, with --locked", () => {
    const cargoScripts = Object.entries(packageJson.scripts).filter(([, command]) =>
      command.startsWith("cargo ")
    );
    expect(cargoScripts.length).toBeGreaterThan(0);
    for (const [name, command] of cargoScripts) {
      const cargoCall = command.split("&&")[0] ?? "";
      expect(cargoCall, `${name} must name the crate`).toContain("-p kaine_forge_desktop_native");
      expect(cargoCall, `${name} must not compile the whole workspace`).not.toContain(
        "--workspace"
      );
      if (!/^cargo (run|fmt|clean) /.test(cargoCall)) {
        expect(cargoCall, `${name} must use the committed Cargo.lock`).toContain("--locked");
      }
    }
  });

  it("is a member of the root Cargo workspace and inherits its lints", () => {
    expect(workspaceManifest).toMatch(/members = \[[^\]]*"apps\/desktop-native"/);
    expect(crateManifest).toMatch(/\[lints\]\s*\nworkspace = true/);
    expect(crateManifest).toMatch(/gpui-kit = \{ workspace = true/);
  });
});
