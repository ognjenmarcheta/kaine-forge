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

  it("renders fallback with design token classes", () => {
    const markup = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
    );
    expect(markup).toContain("bg-[var(--ds-background-neutral-bold)]");
    expect(markup).toContain("text-[color:var(--ds-text-inverse)]");
  });
});

describe("AvatarGroup", () => {
  it("renders overflow count when max is exceeded", () => {
    const markup = renderToStaticMarkup(
      <AvatarGroup max={2}>
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
    expect(markup).toContain("+2");
  });
});
