// @vitest-environment jsdom
import { contrastPairs } from "@repo/theme";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopNav, type TopNavItem } from "./top-nav";

const items: TopNavItem[] = [
  { href: "/overview", label: "Overview" },
  { current: true, href: "/missions", label: "Missions" },
  { href: "/reports", label: "Reports" }
];

/** Stands in for the app router's link component. */
function routerLink(href: string, content: ReactNode): ReactElement {
  return (
    <a data-router-link="" href={href}>
      {content}
    </a>
  );
}

describe("TopNav", () => {
  it.each([
    ["a plain anchor", undefined, null],
    ["the router link", routerLink, ""]
  ] as const)(
    "marks only the current page in a named nav, through %s",
    (_through, renderLink, routerMarker) => {
      document.body.innerHTML = renderToStaticMarkup(
        <TopNav items={items} label="Main" {...(renderLink ? { renderLink } : {})} />
      );
      const nav = document.querySelector("nav");
      const links = Array.from(document.querySelectorAll("nav a"), (link) => [
        link.textContent,
        link.getAttribute("aria-current"),
        link.getAttribute("data-router-link")
      ]);

      expect(nav?.getAttribute("aria-label")).toBe("Main");
      expect(links).toEqual([
        ["Overview", null, routerMarker],
        ["Missions", "page", routerMarker],
        ["Reports", null, routerMarker]
      ]);
    }
  );

  it.each([
    [undefined, "background-selected", "text-selected"],
    ["filled", "background-selected-bold", "text-brand-inverse"]
  ] as const)(
    "draws the %s current page in a fill and text pair the theme check measures (COLOR-1)",
    (appearance, background, foreground) => {
      document.body.innerHTML = renderToStaticMarkup(
        <TopNav items={items} label="Main" {...(appearance ? { appearance } : {})} />
      );
      const classes = document.querySelector('[aria-current="page"]')?.getAttribute("class") ?? "";
      const fill = /(?:^| )aria-\[current=page\]:bg-ds-bg-([a-z-]+)/.exec(classes)?.[1];
      const text = /(?:^| )aria-\[current=page\]:text-ds-(text-[a-z-]+)/.exec(classes)?.[1];

      expect([`background-${fill}`, text]).toEqual([background, foreground]);
      expect(contrastPairs).toContainEqual(expect.objectContaining({ background, foreground }));
    }
  );

  it.each([
    [undefined, "h-ds-control-medium"],
    ["large", "h-ds-control-large"],
    ["xlarge", "h-ds-control-xlarge"]
  ] as const)(
    "at size %s sets every link to %s, and to the touch height on a phone (A11Y-2)",
    (size, height) => {
      document.body.innerHTML = renderToStaticMarkup(
        <TopNav items={items} label="Main" {...(size ? { size } : {})} />
      );
      const heights = Array.from(document.querySelectorAll("nav a"), (link) =>
        (link.getAttribute("class") ?? "").split(" ").filter((name) => /^(?:max-md:)?h-/.test(name))
      );

      expect(heights).toEqual([
        ["max-md:h-ds-control-xlarge", height],
        ["max-md:h-ds-control-xlarge", height],
        ["max-md:h-ds-control-xlarge", height]
      ]);
    }
  );

  it("with equal item widths lays the links out as equal columns that fill them", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <TopNav itemWidth="equal" items={items} label="Main" />
    );
    const list = (document.querySelector("nav ul")?.getAttribute("class") ?? "").split(" ");
    const links = Array.from(document.querySelectorAll("nav a"), (link) =>
      (link.getAttribute("class") ?? "").split(" ").includes("w-full")
    );

    expect(list).toEqual(expect.arrayContaining(["grid", "grid-flow-col", "auto-cols-[1fr]"]));
    expect(links).toEqual([true, true, true]);
  });
});
