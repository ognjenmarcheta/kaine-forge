import { describe, expect, it } from "vitest";

import { createEmailSender } from "./email.config";

describe("createEmailSender", () => {
  it("returns the console sender when EMAIL_PROVIDER is unset", () => {
    const sender = createEmailSender({});
    expect(typeof sender.send).toBe("function");
  });

  it("returns the console sender when EMAIL_PROVIDER=console", () => {
    const sender = createEmailSender({ EMAIL_PROVIDER: "console" });
    expect(typeof sender.send).toBe("function");
  });

  it("throws on an unknown provider, naming the value", () => {
    expect(() => createEmailSender({ EMAIL_PROVIDER: "sendgrid" })).toThrow(/sendgrid/);
  });

  it("creates a resend sender when RESEND_API_KEY is set", () => {
    const sender = createEmailSender({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "app@example.com"
    });
    expect(typeof sender.send).toBe("function");
  });

  it("requires RESEND_API_KEY when provider is resend", () => {
    expect(() => createEmailSender({ EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });
});
