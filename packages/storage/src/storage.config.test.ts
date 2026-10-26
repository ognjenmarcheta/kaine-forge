import { describe, expect, it } from "vitest";

import { resolveStorageConfig } from "./storage.config";

const required = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret",
  S3_BUCKET: "files"
};

describe("resolveStorageConfig", () => {
  it("keeps short upload and download expiries by default", () => {
    expect(resolveStorageConfig(required)).toMatchObject({
      uploadUrlExpirySeconds: 600,
      downloadUrlExpirySeconds: 300
    });
  });

  it("falls back to S3_PRESIGNED_URL_EXPIRY for each expiry that is unset", () => {
    expect(
      resolveStorageConfig({
        ...required,
        S3_PRESIGNED_URL_EXPIRY: "120",
        S3_DOWNLOAD_URL_EXPIRY: "60"
      })
    ).toMatchObject({ uploadUrlExpirySeconds: 120, downloadUrlExpirySeconds: 60 });
  });
});
