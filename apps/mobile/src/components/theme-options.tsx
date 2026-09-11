import { Button, Text } from "@repo/mobile-ui";
import { View } from "react-native";

import { useTheme } from "../hooks/use-theme";
import { useTranslation } from "../hooks/use-translation";

export function ThemeOptions() {
  const { themeMode, setThemeMode } = useTheme();
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Text variant="label">{t("navigation.theme")}</Text>
      <View className="flex-row flex-wrap gap-2">
        {(["system", "light", "dark"] as const).map((mode) => (
          <Button
            key={mode}
            appearance={themeMode === mode ? "secondary" : "ghost"}
            accessibilityRole="radio"
            accessibilityState={{ checked: themeMode === mode }}
            spacing="compact"
            onPress={() => setThemeMode(mode)}
          >
            {t(
              mode === "system"
                ? "navigation.themeSystem"
                : mode === "dark"
                  ? "navigation.themeDark"
                  : "navigation.themeLight"
            )}
          </Button>
        ))}
      </View>
    </View>
  );
}
