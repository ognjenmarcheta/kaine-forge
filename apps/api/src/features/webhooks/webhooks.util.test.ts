import { describe, expect, it } from "vitest";

import { signWebhookPayload } from "./webhooks.util";

describe("signWebhookPayload", () => {
  // The expected value comes from `openssl dgst -sha256 -hmac`, so a receiver
  // using any HMAC library verifies the same bytes.
  it("signs the timestamp and the raw body with HMAC-SHA256", () => {
    expect(
      signWebhookPayload(
        "whsec_fixed-test-secret",
        1700000000,
        '{"id":"evt_1","type":"todo:created"}'
      )
    ).toBe("v1=02367c10660e9b4dc284fa4c54ee7ede618242df32d6aae3d7990906de51bcd1");
  });
});
