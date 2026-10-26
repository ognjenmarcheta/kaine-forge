import { describe, expect, it } from "vitest";

import { STORAGE_DEFAULTS } from "./storage.definition";
import {
  buildStorageKey,
  contentDisposition,
  getFileExtension,
  matchesFileSignature,
  publicAssetKeyFromUrl,
  parseStorageKey,
  sanitizeFilename,
  validateFile
} from "./storage.util";

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value]
    )
  );

describe("buildStorageKey", () => {
  it("builds an org-scoped key", () => {
    const key = buildStorageKey({
      organizationId: "org-1",
      entityType: "avatar",
      fileId: "file-1",
      originalName: "photo.png"
    });

    expect(key).toBe("org-1/avatar/file-1/photo.png");
  });

  it("sanitizes the filename in the key", () => {
    const key = buildStorageKey({
      organizationId: "org-1",
      entityType: "document",
      fileId: "file-2",
      originalName: "my file (1).pdf"
    });

    expect(key).toBe("org-1/document/file-2/my_file_1_.pdf");
  });
});

describe("parseStorageKey", () => {
  it("parses a valid key", () => {
    const result = parseStorageKey("org-1/avatar/file-1/photo.png");

    expect(result).toEqual({
      organizationId: "org-1",
      entityType: "avatar",
      fileId: "file-1",
      originalName: "photo.png"
    });
  });

  it("returns null for invalid key with too few segments", () => {
    expect(parseStorageKey("org-1/avatar")).toBeNull();
  });

  it("handles filenames with slashes", () => {
    const result = parseStorageKey("org-1/docs/file-1/path/to/file.txt");

    expect(result).toEqual({
      organizationId: "org-1",
      entityType: "docs",
      fileId: "file-1",
      originalName: "path/to/file.txt"
    });
  });
});

describe("sanitizeFilename", () => {
  it("replaces spaces and special chars with underscores", () => {
    expect(sanitizeFilename("my file (1).pdf")).toBe("my_file_1_.pdf");
  });

  it("strips leading dots and dashes", () => {
    expect(sanitizeFilename(".hidden")).toBe("hidden");
    expect(sanitizeFilename("--file.txt")).toBe("file.txt");
  });

  it("collapses multiple underscores", () => {
    expect(sanitizeFilename("a___b")).toBe("a_b");
  });

  it("truncates to 200 characters", () => {
    const longName = "a".repeat(250) + ".txt";
    expect(sanitizeFilename(longName)).toHaveLength(200);
  });

  it("preserves alphanumeric, dots, dashes, and underscores", () => {
    expect(sanitizeFilename("valid-file_name.2024.txt")).toBe("valid-file_name.2024.txt");
  });
});

describe("validateFile", () => {
  it("passes valid file", () => {
    const result = validateFile(
      { mimeType: "image/png", sizeBytes: 1024 },
      { maxSizeBytes: 10 * 1024 * 1024 }
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects file exceeding max size", () => {
    const result = validateFile(
      { mimeType: "image/png", sizeBytes: 20 * 1024 * 1024 },
      { maxSizeBytes: 10 * 1024 * 1024 }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("exceeds maximum");
  });

  it("rejects disallowed mime type", () => {
    const result = validateFile(
      { mimeType: "application/exe", sizeBytes: 1024 },
      { allowedMimeTypes: ["image/png", "image/jpeg"] }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not allowed");
  });

  it("collects multiple errors", () => {
    const result = validateFile(
      { mimeType: "application/exe", sizeBytes: 20 * 1024 * 1024 },
      { maxSizeBytes: 10 * 1024 * 1024, allowedMimeTypes: ["image/png"] }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it("uses default max size when not specified", () => {
    const { maxFileSizeBytes } = STORAGE_DEFAULTS;

    expect(validateFile({ mimeType: "image/png", sizeBytes: maxFileSizeBytes }).valid).toBe(true);
    expect(validateFile({ mimeType: "image/png", sizeBytes: maxFileSizeBytes + 1 }).valid).toBe(
      false
    );
  });

  it("skips mime type check when allowedMimeTypes is empty", () => {
    const result = validateFile(
      { mimeType: "anything/here", sizeBytes: 1024 },
      { allowedMimeTypes: [] }
    );

    expect(result.valid).toBe(true);
  });

  it("applies the default MIME allowlist when options omit allowedMimeTypes", () => {
    expect(validateFile({ mimeType: "image/png", sizeBytes: 1024 }).valid).toBe(true);
    expect(validateFile({ mimeType: "image/svg+xml", sizeBytes: 1024 }).valid).toBe(false);
    expect(validateFile({ mimeType: "application/x-msdownload", sizeBytes: 1024 }).valid).toBe(
      false
    );
  });

  it("rejects a name whose extension does not belong to the claimed type", () => {
    const check = (originalName: string) =>
      validateFile({ mimeType: "application/pdf", sizeBytes: 1024, originalName }).valid;

    expect(check("invoice.PDF")).toBe(true);
    expect(check("invoice.pdf.exe")).toBe(false);
    expect(check("invoice")).toBe(false);
  });
});

describe("matchesFileSignature", () => {
  const png = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a);
  const zip = bytes("PK", 0x03, 0x04);
  const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

  it.each([
    ["image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["image/png", png],
    ["image/gif", bytes("GIF89a")],
    ["image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 ")],
    ["application/pdf", bytes("%PDF-1.7")],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip],
    ["application/msword", ole],
    ["application/vnd.ms-excel", ole],
    ["text/csv", bytes("a,b\n1,2\n")]
  ])("accepts a real %s", (mimeType, sample) => {
    expect(matchesFileSignature(mimeType, sample)).toBe(true);
  });

  it("rejects bytes of another type, binary claimed as text, and types with no signature", () => {
    expect(matchesFileSignature("application/pdf", png)).toBe(false);
    expect(matchesFileSignature("image/png", bytes("<html>"))).toBe(false);
    expect(matchesFileSignature("text/plain", bytes("MZ", 0x90, 0))).toBe(false);
    expect(matchesFileSignature("video/mp4", png)).toBe(false);
  });
});

describe("contentDisposition", () => {
  it("renders images inline and downloads everything else under a safe name", () => {
    expect(contentDisposition("image/png", "photo.png")).toBe("inline");
    expect(contentDisposition("application/pdf", 'q3 "report".pdf')).toBe(
      'attachment; filename="q3_report_.pdf"'
    );
  });
});

describe("getFileExtension", () => {
  it("returns extension for normal filename", () => {
    expect(getFileExtension("photo.png")).toBe("png");
  });

  it("returns lowercase extension", () => {
    expect(getFileExtension("document.PDF")).toBe("pdf");
  });

  it("returns empty string for no extension", () => {
    expect(getFileExtension("Makefile")).toBe("");
  });

  it("returns empty string when dot is at end", () => {
    expect(getFileExtension("file.")).toBe("");
  });

  it("returns last extension for multiple dots", () => {
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
  });
});

describe("publicAssetKeyFromUrl", () => {
  it("returns the key only for a URL served from the base URL", () => {
    const base = "https://cdn.example.com";

    expect(publicAssetKeyFromUrl(base, `${base}/avatars/a.webp`)).toBe("avatars/a.webp");
    expect(publicAssetKeyFromUrl(base, "https://lh3.googleusercontent.com/a.png")).toBeNull();
    expect(
      publicAssetKeyFromUrl(base, "https://cdn.example.com.evil.test/avatars/a.webp")
    ).toBeNull();
  });
});
