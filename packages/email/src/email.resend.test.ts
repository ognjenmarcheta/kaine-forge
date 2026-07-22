import { describe, expect, it, vi } from "vitest";

import { createResendEmailSender } from "./email.resend";

describe("createResendEmailSender", () => {
  it("posts the message to Resend with the API key", async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => new Response("{}", { status: 200 }));
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
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          from: "noreply@example.com",
          to: ["user@example.com"],
          subject: "Hello",
          text: "Body"
        })
      })
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test");
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
