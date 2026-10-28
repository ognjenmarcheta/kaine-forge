import "react-native-gesture-handler";
import "../src/styles/global.css";
import "../src/lib/validate-env";

import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { ThemeRoot, defaultThemeName, nativeThemeFonts } from "@repo/mobile-ui";
import { useFonts } from "expo-font";
import { Slot, SplashScreen } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useTheme } from "../src/hooks/use-theme";
import { AppProviders } from "../src/providers";

void SplashScreen.preventAutoHideAsync();

function RootContent() {
  const { resolvedTheme, isHydrating, themeName } = useTheme();
  // The default theme registers Geist. A theme with other custom fonts adds them here.
  const geist = nativeThemeFonts[defaultThemeName];
  const [fontsLoaded, fontError] = useFonts({
    [geist.sans.regular]: Geist_400Regular,
    [geist.sans.medium]: Geist_500Medium,
    [geist.sans.semibold]: Geist_600SemiBold,
    [geist.sans.bold]: Geist_700Bold,
    [geist.mono.regular]: GeistMono_400Regular
  });
  // A font load error falls back to the system font instead of blocking the app.
  const ready = !isHydrating && (fontsLoaded || fontError !== null);
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  return (
    <ThemeRoot theme={themeName} mode={resolvedTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {ready ? <Slot /> : null}
    </ThemeRoot>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <RootContent />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
