// @vitest-environment jsdom
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
});
