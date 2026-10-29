// @vitest-environment jsdom
import { contrastPairs, defaultTheme } from "@repo/theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar, AvatarFallback, AvatarGroup } from "./avatar";

const classOf = (markup: string): string => /class="([^"]*)"/.exec(markup)?.[1] ?? "";

/** The pixel width a `size-[calc(var(--ds-space-a)+var(--ds-space-b))]` class resolves to. */
function calcPixels(classes: string): number | undefined {
  const match = /size-\[calc\(var\(--ds-(space-\d+)\)\+var\(--ds-(space-\d+)\)\)\]/.exec(classes);
  if (!match) return undefined;
  const rem = (step: string | undefined) =>
    Number.parseFloat(
      Object.entries(defaultTheme.scale).find(([name]) => name === step)?.[1] ?? ""
    );
  return (rem(match[1]) + rem(match[2])) * 16;
}

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

  it.each([28, 36, 44] as const)("is %ipx wide at size %i, from the space tokens", (size) => {
    const markup = renderToStaticMarkup(<Avatar size={size} />);

    expect(calcPixels(classOf(markup))).toBe(size);
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
    "discovery",
    "chart-1",
    "chart-6"
  ] as const)(
    "draws %s initials in a fill and text pair that the theme check measures (COLOR-1)",
    (tone) => {
      const markup = renderToStaticMarkup(<AvatarFallback tone={tone}>AB</AvatarFallback>);
      const classes = /class="([^"]*)"/.exec(markup)?.[1] ?? "";
      // Utility names map to role names: bg-ds-bg-success is background-success.
      const background = /(?:^| )bg-ds-bg-([a-z0-9-]+)/.exec(classes)?.[1];
      const foreground = /(?:^| )text-ds-(text-[a-z0-9-]+)/.exec(classes)?.[1];

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

  it("draws the overflow chip in the chosen tone's measured pair (COLOR-1)", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <AvatarGroup
        aria-label="On shift"
        max={1}
        overflowLabel={(count) => `+${count}`}
        overflowTone="brand"
      >
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>B</AvatarFallback>
        </Avatar>
      </AvatarGroup>
    );
    const chip = document.querySelector('[role="group"]')?.lastElementChild;
    const classes = chip?.getAttribute("class") ?? "";

    expect(chip?.textContent).toBe("+1");
    expect(/(?:^| )bg-ds-bg-([a-z-]+)/.exec(classes)?.[1]).toBe("brand-bold");
    expect(/(?:^| )text-ds-(text-[a-z-]+)/.exec(classes)?.[1]).toBe("text-brand-inverse");
  });

  it.each([
    [undefined, "-space-x-ds-100"],
    ["sm", "-space-x-ds-050"]
  ] as const)("with overlap %s slides each avatar over the last one with %s", (overlap, step) => {
    const markup = renderToStaticMarkup(
      <AvatarGroup aria-label="Attendees" {...(overlap ? { overlap } : {})}>
        <Avatar />
      </AvatarGroup>
    );

    expect(classOf(markup).split(" ")).toContain(step);
  });
});
