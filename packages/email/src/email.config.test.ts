import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmailSender } from "./email.config";

const message = { to: "user@example.com", subject: "Hello", html: "<p>Body</p>", text: "Body" };

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createEmailSender", () => {
  it.each<{ label: string; env: Record<string, string | undefined> }>([
    { label: "unset", env: {} },
    { label: "console", env: { EMAIL_PROVIDER: "console" } }
  ])("returns the console sender when EMAIL_PROVIDER is $label", async ({ env }) => {
    const fetchMock = stubFetch();

    await createEmailSender(env).send(message);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on an unknown provider, naming the value", () => {
    expect(() => createEmailSender({ EMAIL_PROVIDER: "sendgrid" })).toThrow(/sendgrid/);
  });

  it("creates a resend sender when RESEND_API_KEY is set", async () => {
    const fetchMock = stubFetch();

    await createEmailSender({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "app@example.com"
    }).send(message);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(init?.body))).toMatchObject({ from: "app@example.com" });
  });

  it("requires RESEND_API_KEY when provider is resend", () => {
    expect(() => createEmailSender({ EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });
});
