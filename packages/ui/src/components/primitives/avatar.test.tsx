// @vitest-environment jsdom
import { contrastPairs } from "@repo/theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar, AvatarFallback, AvatarGroup } from "./avatar";

describe("Avatar", () => {
  it("applies size variant classes", () => {
    const markup = renderToStaticMarkup(
      <Avatar size="lg">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(markup).toContain("h-10 w-10");
    expect(markup).toContain("AB");
  });
});

describe("AvatarFallback", () => {
  it.each([
    "neutral",
    "brand",
    "information",
    "success",
    "warning",
    "danger",
    "discovery"
  ] as const)(
    "draws %s initials in a fill and text pair that the theme check measures (COLOR-1)",
    (tone) => {
      const markup = renderToStaticMarkup(<AvatarFallback tone={tone}>AB</AvatarFallback>);
      const classes = /class="([^"]*)"/.exec(markup)?.[1] ?? "";
      // Utility names map to role names: bg-ds-bg-success is background-success.
      const background = /(?:^| )bg-ds-bg-([a-z-]+)/.exec(classes)?.[1];
      const foreground = /(?:^| )text-ds-(text-[a-z-]+)/.exec(classes)?.[1];

      expect(contrastPairs).toContainEqual(
        expect.objectContaining({ background: `background-${background}`, foreground })
      );
    }
  );
});

describe("AvatarGroup", () => {
  it("shows max avatars in a named group and folds the rest into the overflow label", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <AvatarGroup aria-label="Assignees" max={2} overflowLabel={(count) => `${count} more`}>
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>B</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>C</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>D</AvatarFallback>
        </Avatar>
      </AvatarGroup>
    );
    const group = document.querySelector('[role="group"]');

    expect(group?.getAttribute("aria-label")).toBe("Assignees");
    expect(Array.from(group?.children ?? [], (child) => child.textContent)).toEqual([
      "A",
      "B",
      "2 more"
    ]);
  });
});
