import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatCard, type StatCardDelta } from "./stat-card";

/** The text a screen reader reads, in order. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]+>/g, "");
}

describe("StatCard", () => {
  it.each([
    [0, "false", "Open invoices0"],
    ["65%", "false", "Open invoices65%"],
    [undefined, "true", "Open invoices"]
  ] as const)("shows the value %s, busy only while it loads", (value, busy, text) => {
    const markup = renderToStaticMarkup(<StatCard label="Open invoices" value={value} />);

    expect(markup).toContain(`aria-busy="${busy}"`);
    expect(textOf(markup)).toBe(text);
  });

  it("says the direction of a change in words, not only with an arrow and a color", () => {
    const delta: StatCardDelta = {
      direction: "down",
      directionLabel: "Down",
      label: "3%",
      tone: "danger"
    };
    const markup = renderToStaticMarkup(<StatCard delta={delta} label="Visits" value="1,204" />);

    expect(textOf(markup)).toBe("Visits1,204Down3%");
  });
});
