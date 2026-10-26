import sharp, { type Sharp } from "sharp";

import { STORAGE_CONFIG } from "./storage.definition";

/** Runs at most `limit` tasks at once; the others wait in order. */
function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }

    active += 1;

    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

const limited = createLimiter(STORAGE_CONFIG.image.concurrency);

function load(input: Uint8Array, animated = false): Sharp {
  return sharp(input, {
    animated,
    failOn: "error",
    limitInputPixels: STORAGE_CONFIG.image.maxInputPixels
  });
}

const ANIMATED_TYPES = new Set(["image/gif", "image/webp"]);

function encodeAs(pipeline: Sharp, mimeType: string): Sharp {
  switch (mimeType) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: 90, mozjpeg: true });
    case "image/png":
      return pipeline.png();
    case "image/gif":
      return pipeline.gif();
    case "image/webp":
      return pipeline.webp({ quality: 90 });
    default:
      throw new Error(`unsupported image type ${mimeType}`);
  }
}

/**
 * Re-encodes an uploaded image in its own format with every metadata block
 * (EXIF, GPS, XMP) removed and its orientation applied, and renders a WebP
 * thumbnail. Animated GIF and WebP keep their frames. Rejects inputs above the
 * pixel limit and inputs libvips cannot decode.
 */
export function sanitizeImage(
  input: Uint8Array,
  mimeType: string
): Promise<{ image: Buffer; thumbnail: Buffer }> {
  return limited(async () => {
    const animated = ANIMATED_TYPES.has(mimeType);
    const source = animated ? load(input, true) : load(input).rotate();
    const image = await encodeAs(source, mimeType).toBuffer();
    const thumbnail = await load(input)
      .rotate()
      .resize(STORAGE_CONFIG.image.thumbnailSize, STORAGE_CONFIG.image.thumbnailSize, {
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 80 })
      .toBuffer();

    return { image, thumbnail };
  });
}

/** A square WebP of `size` pixels with no metadata, for a Public Asset. */
export function renderSquareWebp(input: Uint8Array, size: number): Promise<Buffer> {
  return limited(() =>
    load(input).rotate().resize(size, size, { fit: "cover" }).webp({ quality: 85 }).toBuffer()
  );
}
