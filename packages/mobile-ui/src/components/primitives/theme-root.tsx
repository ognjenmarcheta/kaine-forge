import { vars } from "nativewind";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { View } from "react-native";

import {
  defaultThemeName,
  nativeThemeFonts,
  nativeThemeTokens,
  themeVariables
} from "../../lib/design-tokens";

export type ColorMode = "light" | "dark";
type RegisteredTheme = keyof typeof themeVariables;

function isRegisteredTheme(name: string): name is RegisteredTheme {
  return Object.hasOwn(themeVariables, name);
}

const ThemeRootContext = createContext<{ theme: RegisteredTheme; mode: ColorMode }>({
  theme: defaultThemeName,
  mode: "light"
});

export interface ThemeRootProps {
  /** A registered theme name. An unknown name falls back to the default theme. */
  theme: string;
  mode: ColorMode;
  children: ReactNode;
}

/** Applies a theme and color mode to everything inside, at runtime, through NativeWind vars(). */
export function ThemeRoot({ theme, mode, children }: ThemeRootProps) {
  const name = isRegisteredTheme(theme) ? theme : defaultThemeName;
  const value = useMemo(() => ({ theme: name, mode }), [name, mode]);
  const variables = useMemo(() => vars(themeVariables[name][mode]), [name, mode]);

  return (
    <ThemeRootContext.Provider value={value}>
      <View className={mode === "dark" ? "dark flex-1" : "flex-1"} style={[{ flex: 1 }, variables]}>
        {children}
      </View>
    </ThemeRootContext.Provider>
  );
}

/** Concrete colors of the active theme and mode, for APIs that cannot read classes. */
export function useThemeTokens() {
  const { theme, mode } = useContext(ThemeRootContext);

  return nativeThemeTokens[theme][mode];
}

/** The font families of the active theme. */
export function useThemeFonts() {
  const { theme } = useContext(ThemeRootContext);

  return nativeThemeFonts[theme];
}
