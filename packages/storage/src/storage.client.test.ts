import { describe, expect, it } from "vitest";

import { createStorageClient, deleteObject } from "./storage.client";

describe("deleteObject", () => {
  it("stops when its abort signal fires, so a caller can bound a stalled object store", async () => {
    // Port 9 (discard) on loopback: without the signal this would be a network error instead.
    const client = createStorageClient({
      accessKey: "test",
      bucket: "files",
      endpoint: "http://127.0.0.1:9",
      forcePathStyle: true,
      presignedUrlExpirySeconds: 900,
      region: "us-east-1",
      secretKey: "test"
    });

    await expect(
      deleteObject(client, "files", "org-1/todo/a.png", { abortSignal: AbortSignal.abort() })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
