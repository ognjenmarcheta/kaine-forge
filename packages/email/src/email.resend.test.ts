import { describe, expect, it, vi } from "vitest";

import { createResendEmailSender } from "./email.resend";

describe("createResendEmailSender", () => {
  it("posts the message to Resend with the API key", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "noreply@example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { error: vi.fn(), info: vi.fn() }
    });

    await sender.send({
      to: "user@example.com",
      subject: "Hello",
      text: "Body"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(init.body))).toEqual({
      from: "noreply@example.com",
      to: ["user@example.com"],
      subject: "Hello",
      text: "Body"
    });
  });

  it("throws when Resend returns a non-OK status", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "noreply@example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { error: vi.fn(), info: vi.fn() }
    });

    await expect(
      sender.send({ to: "user@example.com", subject: "Hello", text: "Body" })
    ).rejects.toThrow(/401/);
  });
});
