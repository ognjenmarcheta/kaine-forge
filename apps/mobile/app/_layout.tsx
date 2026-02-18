import "react-native-gesture-handler";
import "../src/styles/global.css";

import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useTheme } from "../src/hooks/use-theme";
import { AppProviders } from "../src/providers";

function RootContent() {
  const { resolvedTheme } = useTheme();

  return (
    <>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <Slot />
    </>
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
