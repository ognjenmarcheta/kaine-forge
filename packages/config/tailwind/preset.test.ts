import { describe, expect, it } from "vitest";

import preset from "./preset.js";

const colors = preset.theme.extend.colors;
const dsBg = colors["ds-bg"];
const dsBlanket = colors["ds-blanket"];

describe("tailwind design token mappings", () => {
  it("exposes phase 1 interaction state background tokens", () => {
    expect(dsBg.neutral["subtle-pressed"]).toBe("var(--ds-background-neutral-subtle-pressed)");
    expect(dsBg.neutral.pressed).toBe("var(--ds-background-neutral-pressed)");
    expect(dsBg.neutral["bold-hovered"]).toBe("var(--ds-background-neutral-bold-hovered)");
    expect(dsBg.neutral["bold-pressed"]).toBe("var(--ds-background-neutral-bold-pressed)");
    expect(dsBg.brand["bold-pressed"]).toBe("var(--ds-background-brand-bold-pressed)");
    expect(dsBg.selected.hovered).toBe("var(--ds-background-selected-hovered)");
    expect(dsBg.selected.pressed).toBe("var(--ds-background-selected-pressed)");
    expect(dsBg.selected["bold-hovered"]).toBe("var(--ds-background-selected-bold-hovered)");
    expect(dsBg.selected["bold-pressed"]).toBe("var(--ds-background-selected-bold-pressed)");
  });

  it("maps blanket selected token", () => {
    expect(dsBlanket.selected).toBe("var(--ds-blanket-selected)");
  });
});
