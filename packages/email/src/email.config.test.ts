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
});
