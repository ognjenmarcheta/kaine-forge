import { describe, expect, it } from "vitest";

import { createStorageClient, deleteObject, generatePresignedUploadUrl } from "./storage.client";

function client(endpoint = "http://127.0.0.1:9") {
  return createStorageClient({
    accessKey: "test",
    bucket: "files",
    endpoint,
    forcePathStyle: true,
    uploadUrlExpirySeconds: 600,
    downloadUrlExpirySeconds: 300,
    region: "us-east-1",
    secretKey: "test"
  });
}

describe("generatePresignedUploadUrl", () => {
  it("binds the claimed type and size, and carries no checksum of an empty body", async () => {
    const { url } = await generatePresignedUploadUrl(
      client(),
      "files",
      "org-1/todo/file-1/a.png",
      "image/png",
      1234,
      600
    );
    const params = new URL(url).searchParams;

    expect(params.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
      expect.arrayContaining(["content-length", "content-type"])
    );
    expect([...params.keys()].filter((name) => name.includes("checksum"))).toEqual([]);
  });
});

describe("deleteObject", () => {
  it("stops when its abort signal fires, so a caller can bound a stalled object store", async () => {
    // Port 9 (discard) on loopback: without the signal this would be a network error instead.
    await expect(
      deleteObject(client(), "files", "org-1/todo/a.png", { abortSignal: AbortSignal.abort() })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
