import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderSquareWebp, sanitizeImage } from "./attachment.image";

async function photoWithGps(width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: "#3366cc" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "45/1 48/1 0/1" } })
    .toBuffer();
}

describe("sanitizeImage", () => {
  it("removes EXIF and GPS, applies orientation, and renders a small WebP thumbnail", async () => {
    const original = await photoWithGps();
    expect(await sharp(original).metadata()).toMatchObject({
      orientation: 6,
      exif: expect.anything()
    });

    const { image, thumbnail } = await sanitizeImage(original, "image/jpeg");

    const cleaned = await sharp(image).metadata();
    expect(cleaned.format).toBe("jpeg");
    expect(cleaned.exif).toBeUndefined();
    // Orientation 6 rotates the 800x600 photo upright to 600x800.
    expect([cleaned.width, cleaned.height]).toEqual([600, 800]);
    const thumb = await sharp(thumbnail).metadata();
    expect(thumb.format).toBe("webp");
    expect(Math.max(thumb.width, thumb.height)).toBe(320);
    expect(thumb.exif).toBeUndefined();
  });

  it("rejects an image above the pixel limit and bytes that are not an image", async () => {
    const bomb = await sharp({
      create: { width: 6000, height: 5000, channels: 3, background: "#000000" }
    })
      .png()
      .toBuffer();

    await expect(sanitizeImage(bomb, "image/png")).rejects.toThrow(/pixel limit/);
    await expect(
      sanitizeImage(new TextEncoder().encode("not an image"), "image/png")
    ).rejects.toThrow();
  });
});

describe("renderSquareWebp", () => {
  it("renders a square WebP of the requested size with no metadata", async () => {
    const output = await sharp(await renderSquareWebp(await photoWithGps(), 256)).metadata();

    expect([output.format, output.width, output.height, output.exif]).toEqual([
      "webp",
      256,
      256,
      undefined
    ]);
  });
});
