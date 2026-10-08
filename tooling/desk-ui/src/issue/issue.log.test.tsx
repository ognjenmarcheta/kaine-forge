import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LogPanel, useIssueLog } from "./issue.log";
import { formatClock } from "../shell/shell.format";
import { fakeApi, renderDesk } from "../test/test.render";

function LoadedLog({ issueNumber }: { readonly issueNumber: number }) {
  useIssueLog(issueNumber);
  return <LogPanel issueNumber={issueNumber} />;
}

describe("LogPanel", () => {
  it("shows each entry's time once, as a local time element, beside text that has none", async () => {
    const at = "2026-03-01T10:04:05.000Z";
    const { container } = renderDesk(
      <LoadedLog issueNumber={7} />,
      fakeApi({
        log: () =>
          Promise.resolve({
            entries: [{ seq: 1, at, issueNumber: 7, kind: "history", text: "plan: plan-ready" }],
            last: 1
          })
      })
    );
    expect(await screen.findByText("plan: plan-ready")).toBeTruthy();
    const times = container.querySelectorAll("time");
    expect(times).toHaveLength(1);
    expect(times[0]?.getAttribute("datetime")).toBe(at);
    expect(times[0]?.textContent).toBe(formatClock(at, "en"));
  });
});
