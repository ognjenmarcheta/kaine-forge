import { render, screen } from "@testing-library/react";
import { Text as NativeText } from "react-native";
import { describe, expect, it } from "vitest";

import { ThemeRoot, useThemeTokens } from "./theme-root";
import { nativeThemeTokens } from "../../lib/design-tokens";

function TextColor() {
  return <NativeText testID="text-color">{useThemeTokens().text}</NativeText>;
}

describe("ThemeRoot", () => {
  it.each([
    ["byte-forge", "dark", nativeThemeTokens["byte-forge"].dark.text],
    ["moss", "light", nativeThemeTokens.moss.light.text],
    ["retired-theme", "light", nativeThemeTokens["byte-forge"].light.text]
  ] as const)("gives %s in %s mode the text color %s", (theme, mode, color) => {
    render(
      <ThemeRoot theme={theme} mode={mode}>
        <TextColor />
      </ThemeRoot>
    );

    expect(screen.getByTestId("text-color").textContent).toBe(color);
  });
});
