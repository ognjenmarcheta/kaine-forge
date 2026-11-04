import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * Changesets bumps package.json versions only. The native desktop app's installers
 * take their version from its Cargo.toml, so `release:version` runs this after
 * `changeset version` to copy the package version into the crate and the lockfile
 * (ADR 0025). The Tauri bundler reads tauri.conf.json, which points at
 * apps/desktop/package.json; its crate version is synced too so `cargo metadata`
 * never disagrees with the package.
 */
export const SYNCED_CRATES = [
  {
    manifest: "apps/desktop-native/package.json",
    cargoToml: "apps/desktop-native/Cargo.toml"
  },
  {
    manifest: "apps/desktop/package.json",
    cargoToml: "apps/desktop/src-tauri/Cargo.toml"
  }
];

/**
 * Copies the package version into a crate's manifest and its Cargo.lock entry.
 * @param {{ packageJson: string, cargoToml: string, cargoLock: string }} input
 * @returns {{ crate: string, version: string, cargoToml: string, cargoLock: string, changed: boolean }}
 */
export function syncCargoVersion({ packageJson, cargoToml, cargoLock }) {
  const { version } = JSON.parse(packageJson);
  if (typeof version !== "string" || version === "") throw new Error("package.json has no version");
  const crate = /^\[package\][\s\S]*?^name = "([^"]+)"/m.exec(cargoToml)?.[1];
  if (!crate) throw new Error("Cargo.toml has no [package] name");

  const manifest = cargoToml.replace(
    /^(\[package\][\s\S]*?^version = ")[^"]*(")/m,
    (_match, before, after) => `${before}${version}${after}`
  );
  if (!manifest.includes(`version = "${version}"`)) {
    throw new Error("Cargo.toml has no [package] version to update");
  }

  const entry = new RegExp(`^(\\[\\[package\\]\\]\\nname = "${crate}"\\nversion = ")[^"]*(")`, "m");
  if (!entry.test(cargoLock)) throw new Error(`Cargo.lock has no entry for ${crate}`);
  const lock = cargoLock.replace(entry, (_match, before, after) => `${before}${version}${after}`);

  return {
    crate,
    version,
    cargoToml: manifest,
    cargoLock: lock,
    changed: manifest !== cargoToml || lock !== cargoLock
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let cargoLock = readFileSync("Cargo.lock", "utf8");
  for (const { manifest, cargoToml } of SYNCED_CRATES) {
    const synced = syncCargoVersion({
      packageJson: readFileSync(manifest, "utf8"),
      cargoToml: readFileSync(cargoToml, "utf8"),
      cargoLock
    });
    if (synced.changed) {
      writeFileSync(cargoToml, synced.cargoToml);
      cargoLock = synced.cargoLock;
      console.log(`${cargoToml}: version ${synced.version}`);
    } else {
      console.log(`${cargoToml}: already ${synced.version}`);
    }
  }
  writeFileSync("Cargo.lock", cargoLock);
}
