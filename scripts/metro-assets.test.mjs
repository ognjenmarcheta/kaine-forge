import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, test } from "node:test";
import { URL } from "node:url";

// Exercise the Metro instance selected by the mobile app's Expo installation.
const mobileRequire = createRequire(new URL("../apps/mobile/package.json", import.meta.url));
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const configRequire = createRequire(expoRequire.resolve("@expo/metro-config/package.json"));
const metroRequire = createRequire(configRequire.resolve("@expo/metro/package.json"));
const assetsPath = metroRequire.resolve("metro/private/Assets");
const { getAssetData, getAssetSize } = metroRequire("metro/private/Assets");
const fixtureDir = mkdtempSync(join(tmpdir(), "kaine-metro-assets-"));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
  "base64"
);

test("reads PNG dimensions from buffers and files", async () => {
  assert.deepEqual(getAssetSize("png", png, "pixel.png"), { width: 1, height: 1 });
  const file = join(fixtureDir, "pixel.png");
  writeFileSync(file, png);
  const data = await getAssetData(file, "pixel.png", [], "ios", "/assets");
  assert.equal(data.width, 1);
  assert.equal(data.height, 1);
  assert.deepEqual(data.scales, [1]);
});

test("preserves scale normalization and asset metadata", async () => {
  const file = join(fixtureDir, "icon@2x.svg");
  writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"/>');
  const data = await getAssetData(file, "icon.svg", [], "ios", "/assets");
  assert.equal(data.width, 16);
  assert.equal(data.height, 8);
  assert.equal(data.name, "icon");
  assert.equal(data.type, "svg");
  assert.equal(data.httpServerLocation, "/assets");
  assert.deepEqual(data.scales, [2]);
  assert.deepEqual(data.files, [file]);
  assert.match(data.hash, /^[a-f0-9]{32}$/);
});

test("reads images beneath zip paths using Metro's buffer fallback on POSIX", async (t) => {
  if (process.platform !== "win32") {
    // Archive-aware filesystems require the buffer API on these POSIX paths.
    const imageRequire = createRequire(assetsPath);
    t.mock.method(imageRequire("image-size/fromFile"), "imageSizeFromFile", () => {
      throw new Error("Zip images must use the buffer API");
    });
  }
  const archive = join(fixtureDir, "package.zip");
  mkdirSync(archive);
  const file = join(archive, "pixel.png");
  writeFileSync(file, png);
  const data = await getAssetData(file, "pixel.png", [], null, "/assets");
  assert.equal(data.width, 1);
  assert.equal(data.height, 1);
});

test("leaves non-image assets without dimensions", async () => {
  const file = join(fixtureDir, "font.ttf");
  writeFileSync(file, "not an image");
  assert.equal(getAssetSize("ttf", Buffer.from("not an image"), file), null);
  const data = await getAssetData(file, "font.ttf", [], null, "/assets");
  assert.equal(data.width, undefined);
  assert.equal(data.height, undefined);
  assert.equal(data.type, "ttf");
});

test("rejects empty and malformed images", async () => {
  assert.throws(() => getAssetSize("png", Buffer.alloc(0), "empty.png"), /empty file/);
  const file = join(fixtureDir, "broken.png");
  writeFileSync(file, "not a PNG");
  await assert.rejects(getAssetData(file, "broken.png", [], null, "/assets"));
});

// Malformed images can have any extension. A child timeout protects the test
// runner if a dependency regression reintroduces the synchronous infinite loop.
for (const [format, hex] of [
  ["ICNS", "69636e73000000106963703000000000"],
  ["JXL", "000000004a584c200000000000000000"],
  ["HEIF", "00000000667479706865696300000000"]
]) {
  test(`rejects a zero-length ${format} entry without blocking`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        'const assert = require("node:assert/strict"); const { getAssetSize } = require(process.argv[1]); assert.throws(() => getAssetSize("png", Buffer.from(process.argv[2], "hex"), "untrusted.png"));',
        assetsPath,
        hex
      ],
      { encoding: "utf8", timeout: 5000 }
    );
    assert.equal(result.error, undefined, `${format}: ${result.error?.message}`);
    assert.equal(result.status, 0, result.stderr);
  });
}
