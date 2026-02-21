import { SUPPORTED_LANGUAGES } from "@repo/translation";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "../../src/hooks/use-auth";
import { useTheme } from "../../src/hooks/use-theme";
import { useTranslation } from "../../src/hooks/use-translation";

function nextLanguage(current: string): string {
  const index = SUPPORTED_LANGUAGES.indexOf(current as (typeof SUPPORTED_LANGUAGES)[number]);

  if (index === -1) {
    return SUPPORTED_LANGUAGES[0];
  }

  return SUPPORTED_LANGUAGES[(index + 1) % SUPPORTED_LANGUAGES.length] ?? SUPPORTED_LANGUAGES[0];
}

function nextTheme(current: "dark" | "light" | "system"): "dark" | "light" | "system" {
  if (current === "system") {
    return "light";
  }

  if (current === "light") {
    return "dark";
  }

  return "system";
}

export default function AppLayout() {
  const { isLoading, logout, session } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const { setThemeMode, themeMode } = useTheme();

  const headerTitle = useMemo(() => t("navigation.dashboard"), [t]);

  if (isLoading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Drawer
      screenOptions={{
        headerRight: () => (
          <View className="mr-3 flex-row items-center gap-2">
            <Pressable
              accessibilityLabel={t("navigation.language")}
              className="rounded-md border border-ds-border px-2 py-1"
              onPress={() => {
                void setLanguage(nextLanguage(language));
              }}
            >
              <Text className="text-xs text-ds-text">{language.toUpperCase()}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t("navigation.theme")}
              className="rounded-md border border-ds-border px-2 py-1"
              onPress={() => {
                setThemeMode(nextTheme(themeMode));
              }}
            >
              <Text className="text-xs text-ds-text">{themeMode.toUpperCase()}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t("auth.logout")}
              className="rounded-md border border-ds-border-danger px-2 py-1"
              onPress={() => {
                void logout();
              }}
            >
              <Text className="text-xs text-ds-text-danger">{t("auth.logout")}</Text>
            </Pressable>
          </View>
        ),
        headerTitle,
        sceneStyle: {
          backgroundColor: "transparent"
        }
      }}
    >
      <Drawer.Screen
        name="dashboard"
        options={{
          drawerLabel: t("navigation.dashboard"),
          title: t("navigation.dashboard")
        }}
      />
      <Drawer.Screen
        name="todos/index"
        options={{
          drawerLabel: t("navigation.todos"),
          title: t("navigation.todos")
        }}
      />
    </Drawer>
  );
}
