import { describe, expect, it, vi } from "vitest";

import { createResendEmailSender } from "./email.resend";

describe("createResendEmailSender", () => {
  it("posts the message to Resend with the API key", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response("{}", { status: 200 });
    };

    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "noreply@example.com",
      fetchImpl,
      logger: { error: vi.fn(), info: vi.fn() }
    });

    await sender.send({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Body</p>",
      text: "Body"
    });

    expect(capturedUrl).toBe("https://api.resend.com/emails");
    expect(capturedInit?.method).toBe("POST");
    expect(new Headers(capturedInit?.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      from: "noreply@example.com",
      to: ["user@example.com"],
      subject: "Hello",
      html: "<p>Body</p>",
      text: "Body"
    });
  });

  it("sends a text-only message without an html field", async () => {
    let body: unknown;
    const fetchImpl: typeof fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    };
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "noreply@example.com",
      fetchImpl,
      logger: { error: vi.fn(), info: vi.fn() }
    });

    await sender.send({ to: "user@example.com", subject: "Hello", text: "Body" });

    expect(body).toEqual({
      from: "noreply@example.com",
      to: ["user@example.com"],
      subject: "Hello",
      text: "Body"
    });
  });

  it("throws when Resend returns a non-OK status", async () => {
    const fetchImpl: typeof fetch = async () => new Response("nope", { status: 401 });
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "noreply@example.com",
      fetchImpl,
      logger: { error: vi.fn(), info: vi.fn() }
    });

    await expect(
      sender.send({ to: "user@example.com", subject: "Hello", html: "<p>Body</p>", text: "Body" })
    ).rejects.toThrow(/401/);
  });
});
