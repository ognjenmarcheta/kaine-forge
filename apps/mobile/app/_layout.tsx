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
import { fontFamilies } from "@repo/mobile-ui";
import { useFonts } from "expo-font";
import { Slot, SplashScreen } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useTheme } from "../src/hooks/use-theme";
import { AppProviders } from "../src/providers";

void SplashScreen.preventAutoHideAsync();

function RootContent() {
  const { resolvedTheme, isHydrating } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    [fontFamilies.regular]: Geist_400Regular,
    [fontFamilies.medium]: Geist_500Medium,
    [fontFamilies.semibold]: Geist_600SemiBold,
    [fontFamilies.bold]: Geist_700Bold,
    [fontFamilies.mono]: GeistMono_400Regular
  });
  // A font load error falls back to the system font instead of blocking the app.
  const ready = !isHydrating && (fontsLoaded || fontError !== null);
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  return (
    <View className={isDark ? "dark flex-1" : "flex-1"} style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {ready ? <Slot /> : null}
    </View>
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
