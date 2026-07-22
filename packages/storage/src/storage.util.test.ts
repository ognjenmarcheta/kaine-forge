import { describe, expect, it } from "vitest";

import {
  buildStorageKey,
  getFileExtension,
  parseStorageKey,
  sanitizeFilename,
  validateFile
} from "./storage.util";

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
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(200);
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
    const result = validateFile({ mimeType: "image/png", sizeBytes: 5 * 1024 * 1024 });

    expect(result.valid).toBe(true);
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
