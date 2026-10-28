// @vitest-environment jsdom
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

  // Tailwind reads `_` in an arbitrary variant as a space, so the BEM class names cannot be
  // targeted from className; the data-slot names can: `[&_[data-slot=stat-card-label]]:…`.
  it.each([
    ["stat-card-label", "Open invoices"],
    ["stat-card-value", "42"],
    ["stat-card-description", "This month"],
    ["stat-card-visual", "Ring"]
  ])("marks the %s part for caller styling", (slot, text) => {
    document.body.innerHTML = renderToStaticMarkup(
      <StatCard
        description="This month"
        label="Open invoices"
        value={42}
        visual={<span>Ring</span>}
      />
    );

    expect(document.querySelector(`[data-slot="${slot}"]`)?.textContent).toBe(text);
  });
});
