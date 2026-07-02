import type { Logger } from "@repo/logger";
import { describe, expect, it, vi } from "vitest";

import { createConsoleEmailSender } from "./email.console";

describe("createConsoleEmailSender", () => {
  it("logs the message fields and resolves", async () => {
    const info = vi.fn();
    const logger: Pick<Logger, "info"> = { info };
    const sender = createConsoleEmailSender(logger);

    await expect(
      sender.send({ to: "user@example.com", subject: "Hello", text: "Body" })
    ).resolves.toBeUndefined();

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", subject: "Hello", text: "Body" }),
      expect.any(String)
    );
  });
});
