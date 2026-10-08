import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { applySnapshot, collectSnapshot } from "./context-snapshot.util";

it("preserves file content and refuses to write through destination symlinks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-snapshot-"));
  try {
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    mkdirSync(source);
    mkdirSync(target);
    mkdirSync(path.join(source, "dir"));
    writeFileSync(path.join(source, "dir/file"), "content");
    const snapshot = collectSnapshot(source, ["dir/file"]);
    symlinkSync(source, path.join(target, "dir"), "junction");
    expect(() => applySnapshot(path.join(target, "dir"), snapshot.entries)).toThrow(
      "Unsafe snapshot root"
    );
    expect(() => applySnapshot(target, snapshot.entries)).toThrow("Unsafe snapshot ancestor");
    expect(() => collectSnapshot(source, ["../outside"])).toThrow("Unsafe snapshot path");
    expect(() => collectSnapshot(source, ["missing"])).toThrow("deleted tracked file");
    rmSync(path.join(target, "dir"), { recursive: true });
    applySnapshot(target, snapshot.entries);
    expect(readFileSync(path.join(target, "dir/file"), "utf8")).toBe("content");
    writeFileSync(path.join(source, "dir/file"), "changed");
    expect(collectSnapshot(source, ["dir/file"]).hash).not.toBe(snapshot.hash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "preserves executable bits and relative/dangling links on POSIX",
  () => {
    const root = mkdtempSync(path.join(tmpdir(), "kaine-snapshot-posix-"));
    try {
      const source = path.join(root, "source");
      const target = path.join(root, "target");
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(path.join(source, "run"), "#!/bin/sh\nexit 0\n");
      chmodSync(path.join(source, "run"), 0o755);
      symlinkSync("run", path.join(source, "relative"));
      symlinkSync("missing", path.join(source, "dangling"));
      const snapshot = collectSnapshot(source, ["run", "relative", "dangling"]);
      applySnapshot(target, snapshot.entries);
      expect(lstatSync(path.join(target, "run")).mode & 0o777).toBe(0o755);
      expect(readlinkSync(path.join(target, "relative"))).toBe("run");
      expect(readlinkSync(path.join(target, "dangling"))).toBe("missing");
      chmodSync(path.join(source, "run"), 0o644);
      expect(collectSnapshot(source, ["run", "relative", "dangling"]).hash).not.toBe(snapshot.hash);
      chmodSync(path.join(source, "run"), 0o755);
      rmSync(path.join(source, "relative"));
      symlinkSync("other", path.join(source, "relative"));
      expect(collectSnapshot(source, ["run", "relative", "dangling"]).hash).not.toBe(snapshot.hash);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);
