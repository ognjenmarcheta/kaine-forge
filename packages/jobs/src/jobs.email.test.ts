import type { EmailMessage } from "@repo/email";
import { describe, expect, it } from "vitest";

import { createEmailJobHandler, EMAIL_JOB } from "./jobs.email";

describe("email.send job", () => {
  it("delivers a job enqueued before emails had an html part as text only", async () => {
    const sent: EmailMessage[] = [];
    const handle = createEmailJobHandler({ send: async (message) => void sent.push(message) });

    await handle(
      EMAIL_JOB.payload.parse({ to: "user@example.com", subject: "Hello", text: "Body" })
    );

    expect(sent).toEqual([{ to: "user@example.com", subject: "Hello", text: "Body" }]);
  });
});
