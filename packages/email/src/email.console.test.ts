import { describe, expect, it, vi } from "vitest";

import { createConsoleEmailSender } from "./email.console";

describe("createConsoleEmailSender", () => {
  it("logs the message fields and resolves", async () => {
    const info = vi.fn();
    const sender = createConsoleEmailSender({ info } as never);

    await expect(
      sender.send({ to: "user@example.com", subject: "Hello", text: "Body" })
    ).resolves.toBeUndefined();

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", subject: "Hello" }),
      expect.any(String)
    );
  });
});
