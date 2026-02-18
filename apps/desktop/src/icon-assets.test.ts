import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

describe("desktop tauri assets", () => {
  it("includes a valid RGBA PNG icon for Tauri runtime", () => {
    const iconPath = resolve(process.cwd(), "src-tauri/icons/icon.png");
    const png = readFileSync(iconPath);
    const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
    const idatChunks: Buffer[] = [];
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlaceMethod = 0;
    let offset = pngSignature.length;

    expect(png.subarray(0, pngSignature.length).equals(pngSignature)).toBe(true);

    while (offset + 12 <= png.length) {
      const chunkLength = png.readUInt32BE(offset);
      const chunkType = png.subarray(offset + 4, offset + 8).toString("ascii");
      const chunkDataStart = offset + 8;
      const chunkDataEnd = chunkDataStart + chunkLength;
      const chunkCrcEnd = chunkDataEnd + 4;

      expect(chunkCrcEnd).toBeLessThanOrEqual(png.length);

      if (chunkType === "IHDR") {
        width = png.readUInt32BE(chunkDataStart);
        height = png.readUInt32BE(chunkDataStart + 4);
        bitDepth = png.readUInt8(chunkDataStart + 8);
        colorType = png.readUInt8(chunkDataStart + 9);
        interlaceMethod = png.readUInt8(chunkDataStart + 12);
      }

      if (chunkType === "IDAT") {
        idatChunks.push(png.subarray(chunkDataStart, chunkDataEnd));
      }

      offset = chunkCrcEnd;

      if (chunkType === "IEND") {
        break;
      }
    }

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(bitDepth).toBe(8);
    expect(colorType).toBe(6);
    expect(interlaceMethod).toBe(0);
    expect(idatChunks.length).toBeGreaterThan(0);

    const decoded = inflateSync(Buffer.concat(idatChunks));
    const expectedRgbaScanlineBytes = (width * 4 + 1) * height;

    expect(decoded.byteLength).toBe(expectedRgbaScanlineBytes);
  });
});
