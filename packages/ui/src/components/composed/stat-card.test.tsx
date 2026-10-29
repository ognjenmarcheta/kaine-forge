// @vitest-environment jsdom
import { colorRoles, contrastRatio, resolveColor, themes, type ColorRole } from "@repo/theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatCard, type StatCardDelta, type StatCardProps } from "./stat-card";

const rise: StatCardDelta = { direction: "up", directionLabel: "Up", label: "12%" };

const roleNames: ReadonlySet<string> = new Set(colorRoles);
const isColorRole = (name: string | undefined): name is ColorRole =>
  name !== undefined && roleNames.has(name);

/** Renders a card into the document and returns the element of one slot. */
function slotOf(props: StatCardProps, slot: string): Element | null {
  document.body.innerHTML = renderToStaticMarkup(<StatCard {...props} />);
  return document.querySelector(`[data-slot="${slot}"]`);
}

/** The text a screen reader reads, in order, parsed by the DOM rather than a tag pattern. */
function textOf(markup: string): string {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.textContent;
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

  it.each(["danger", "neutral", "success"] as const)(
    "draws a plain %s change with no fill, at 4.5:1 on the card in every theme and mode (COLOR-1)",
    (tone) => {
      const classes =
        slotOf(
          { delta: { ...rise, appearance: "text", tone }, label: "Visits", value: 9 },
          "stat-card-delta"
        )?.getAttribute("class") ?? "";
      const ink = /(?:^| )text-ds-(text[a-z-]*)/.exec(classes)?.[1];
      if (!isColorRole(ink)) throw new Error(`No text role in: ${classes}`);
      const lowest = Math.min(
        ...themes.flatMap((theme) =>
          (["light", "dark"] as const).map((mode) =>
            contrastRatio(
              resolveColor(theme, mode, ink),
              resolveColor(theme, mode, "surface-raised"),
              resolveColor(theme, mode, "surface")
            )
          )
        )
      );

      expect(classes).not.toMatch(/(?:^| )bg-/);
      expect(lowest).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each([
    ["the arrow", undefined, [expect.stringContaining("lucide-arrow-up")]],
    ["no icon", null, []],
    ["a given icon", <svg key="icon" className="trend" />, ["trend"]]
  ])("draws %s before the change, hidden from screen readers", (_icon, icon, svgs) => {
    const delta = slotOf(
      { delta: { ...rise, ...(icon === undefined ? {} : { icon }) }, label: "Visits", value: 9 },
      "stat-card-delta"
    );
    const drawn = Array.from(delta?.querySelectorAll("svg") ?? []);

    expect(drawn.map((svg) => svg.getAttribute("class"))).toEqual(svgs);
    expect(drawn.filter((svg) => svg.closest('[aria-hidden="true"]') === null)).toEqual([]);
    expect(delta?.textContent).toBe("Up12%");
  });

  it("with an icon change, draws a round chip with only the icon and reads the change", () => {
    const delta = slotOf(
      { delta: { ...rise, appearance: "icon", tone: "success" }, label: "Visits", value: 9 },
      "stat-card-delta"
    );
    const shown = Array.from(delta?.childNodes ?? [], (node) =>
      node instanceof Element && node.classList.contains("sr-only") ? "" : node.textContent
    ).join("");

    expect(delta?.textContent).toBe("Up12%");
    expect(shown).toBe("");
    expect(delta?.querySelectorAll("svg")).toHaveLength(1);
    expect(delta?.getAttribute("class")?.split(" ")).toEqual(
      expect.arrayContaining(["rounded-full", "justify-center"])
    );
  });

  it.each([
    [undefined, ["stat-card-body"], "Visits9Up12%This month"],
    ["below", ["stat-card-footer"], "Visits9Up12%This month"],
    ["end", ["stat-card-end", "stat-card-body"], "Visits9This monthUp12%"]
  ] as const)(
    "with the change placed %s, puts it in the %j rows and reads %s",
    (deltaPlacement, rows, text) => {
      const delta = slotOf(
        {
          delta: rise,
          description: "This month",
          label: "Visits",
          value: 9,
          ...(deltaPlacement ? { deltaPlacement } : {})
        },
        "stat-card-delta"
      );
      const around: (string | null)[] = [];
      for (let row = delta?.parentElement; row?.dataset.slot !== "stat-card";) {
        around.push(row?.dataset.slot ?? null);
        row = row?.parentElement;
      }

      expect(around).toEqual(rows);
      expect(document.body.textContent).toBe(text);
    }
  );

  it.each([
    [undefined, "stat-card-header", ["stat-card-icon", "stat-card-label"]],
    ["end", "stat-card-header", ["stat-card-label", "stat-card-icon"]],
    ["leading", "stat-card", ["stat-card-icon", "stat-card-header", "stat-card-body"]]
  ] as const)(
    "with the icon placed %s, orders the %s parts as %j",
    (iconPlacement, parent, order) => {
      const container = slotOf(
        {
          icon: <svg />,
          label: "Visits",
          value: 9,
          ...(iconPlacement ? { iconPlacement } : {})
        },
        parent
      );

      expect(
        Array.from(container?.children ?? [], (child) => child.getAttribute("data-slot"))
      ).toEqual(order);
    }
  );

  it.each([
    [{}, ["ui-stat-card"]],
    [{ iconPlacement: "leading" }, ["ui-stat-card", "ui-stat-card--icon-leading"]],
    [{ iconPlacement: "top" }, ["ui-stat-card", "ui-stat-card--icon-top"]],
    [{ wrap: false }, ["ui-stat-card", "ui-stat-card--nowrap"]]
  ] as const)("with %j takes the layouts %j from globals.css", (layout, classes) => {
    const card = slotOf({ icon: <svg />, label: "Visits", value: 9, ...layout }, "stat-card");

    expect(card?.getAttribute("class")?.split(" ")).toEqual(classes);
  });
});
