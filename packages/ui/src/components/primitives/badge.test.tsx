import { contrastPairs } from "@repo/theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, type BadgeProps } from "./badge";

/** The badge's fill and text roles; utility names map to role names (bg-ds-bg-x is background-x). */
function rolesOf(props: BadgeProps) {
  const classes = /class="([^"]*)"/.exec(renderToStaticMarkup(<Badge {...props}>Lab</Badge>))?.[1];
  return {
    background: /(?:^| )bg-ds-bg-([a-z-]+)/.exec(classes ?? "")?.[1],
    foreground: /(?:^| )text-ds-(text[a-z-]*)/.exec(classes ?? "")?.[1]
  };
}

describe("Badge", () => {
  it("applies compound variant classes for appearance and emphasis", () => {
    const markup = renderToStaticMarkup(
      <Badge appearance="success" emphasis="bold">
        Active
      </Badge>
    );
    expect(markup).toContain("bg-ds-bg-success-bold");
    expect(markup).toContain("text-ds-text-inverse");
  });

  it.each([
    ["selected", "subtle", "background-selected", "text-selected"],
    ["selected", "bold", "background-selected-bold", "text-brand-inverse"]
  ] as const)(
    "draws %s %s text on its fill in a pair the theme check measures (COLOR-1)",
    (appearance, emphasis, background, foreground) => {
      const roles = rolesOf({ appearance, emphasis });

      expect(`background-${roles.background}`).toBe(background);
      expect(roles.foreground).toBe(foreground);
      expect(contrastPairs).toContainEqual(expect.objectContaining({ background, foreground }));
    }
  );

  it.each([
    ["default", "text"],
    ["success", "text-success"],
    ["warning", "text-warning"],
    ["danger", "text-danger"],
    ["information", "text-information"],
    ["discovery", "text-discovery"],
    ["selected", "text-brand"]
  ] as const)(
    "draws an outline %s badge with no fill, in text the theme check measures on the page (COLOR-1)",
    (appearance, foreground) => {
      const roles = rolesOf({ appearance, emphasis: "outline" });

      expect(roles).toEqual({ background: undefined, foreground });
      expect(contrastPairs).toContainEqual(
        expect.objectContaining({ background: "surface", foreground })
      );
    }
  );

  it("merges custom className", () => {
    const markup = renderToStaticMarkup(<Badge className="custom-badge">Default</Badge>);
    expect(markup).toContain("custom-badge");
    expect(markup).toContain("bg-ds-bg-neutral");
  });
});
