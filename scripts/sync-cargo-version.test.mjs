import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SYNCED_CRATES, syncCargoVersion } from "./sync-cargo-version.mjs";

const cargoToml = `[package]\nname = "example_native_app"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies]\nserde = { version = "1" }\n`;
const cargoLock = `[[package]]\nname = "gpui-kit"\nversion = "0.9.0"\n\n[[package]]\nname = "example_native_app"\nversion = "0.0.0"\ndependencies = [\n "gpui-kit",\n]\n`;

describe("sync-cargo-version", () => {
  it("copies the package version into the crate manifest and its lock entry only", () => {
    const synced = syncCargoVersion({
      packageJson: '{ "name": "@repo/desktop-native", "version": "1.4.0" }',
      cargoToml,
      cargoLock
    });
    assert.equal(synced.changed, true);
    assert.match(synced.cargoToml, /^version = "1\.4\.0"$/m);
    assert.match(synced.cargoToml, /serde = \{ version = "1" \}/);
    assert.match(synced.cargoLock, /name = "example_native_app"\nversion = "1\.4\.0"/);
    assert.match(synced.cargoLock, /name = "gpui-kit"\nversion = "0\.9\.0"/);
  });

  it("reports no change when the versions already agree", () => {
    const synced = syncCargoVersion({
      packageJson: '{ "version": "0.0.0" }',
      cargoToml,
      cargoLock
    });
    assert.equal(synced.changed, false);
    assert.equal(synced.cargoToml, cargoToml);
  });

  it("fails when the lockfile has no entry for the crate", () => {
    assert.throws(
      () =>
        syncCargoVersion({
          packageJson: '{ "version": "1.0.0" }',
          cargoToml,
          cargoLock: ""
        }),
      /Cargo.lock has no entry/
    );
  });

  it("keeps the committed crate versions in step with their packages", () => {
    for (const { manifest, cargoToml: cratePath } of SYNCED_CRATES) {
      const synced = syncCargoVersion({
        packageJson: readFileSync(manifest, "utf8"),
        cargoToml: readFileSync(cratePath, "utf8"),
        cargoLock: readFileSync("Cargo.lock", "utf8")
      });
      assert.equal(
        synced.changed,
        false,
        `run node scripts/sync-cargo-version.mjs for ${synced.crate}`
      );
    }
  });
});
