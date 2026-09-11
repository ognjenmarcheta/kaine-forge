import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps
} from "@react-navigation/drawer";
import { FEATURE_FLAGS, useFeatureFlag } from "@repo/feature-flags";
import { Button, Text, nativeThemeTokens } from "@repo/mobile-ui";
import { SUPPORTED_LANGUAGES } from "@repo/translation";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useState } from "react";
import { View } from "react-native";

import { ThemeOptions } from "../../src/components/theme-options";
import { useAuth } from "../../src/hooks/use-auth";
import { useOrganization } from "../../src/hooks/use-organization";
import { useTheme } from "../../src/hooks/use-theme";
import { useTranslation } from "../../src/hooks/use-translation";

function DrawerContent(props: DrawerContentComponentProps) {
  const { session, logout } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const { organizations, activeOrganizationId, setActiveOrganization } = useOrganization();
  const organizationsVisible = useFeatureFlag(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE);
  const [error, setError] = useState(false);
  const [switching, setSwitching] = useState(false);
  return (
    <DrawerContentScrollView {...props}>
      <View className="gap-3 px-4 py-4">
        <Text variant="subheading">{t("common.appName")}</Text>
        {organizationsVisible ? (
          <View className="gap-2">
            <Text variant="label">{t("navigation.organization")}</Text>
            {organizations.map((organization) => (
              <Button
                key={organization.id}
                disabled={switching}
                appearance={organization.id === activeOrganizationId ? "secondary" : "ghost"}
                accessibilityRole="radio"
                accessibilityState={{ checked: organization.id === activeOrganizationId }}
                onPress={() => {
                  setError(false);
                  setSwitching(true);
                  void setActiveOrganization(organization.id)
                    .catch(() => setError(true))
                    .finally(() => setSwitching(false));
                }}
              >
                {organization.name}
              </Button>
            ))}
          </View>
        ) : null}
      </View>
      <DrawerItemList {...props} />
      <View className="mt-4 gap-4 border-t border-ds-border px-4 py-4">
        <ThemeOptions />
        <View className="gap-2">
          <Text variant="label">{t("navigation.language")}</Text>
          <View className="flex-row flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((value) => (
              <Button
                key={value}
                appearance={language === value ? "secondary" : "ghost"}
                spacing="compact"
                accessibilityRole="radio"
                accessibilityState={{ checked: language === value }}
                onPress={() => void setLanguage(value)}
              >
                {value.toUpperCase()}
              </Button>
            ))}
          </View>
        </View>
        <View className="gap-1">
          <Text>{session?.user.name}</Text>
          <Text variant="caption">{session?.user.email}</Text>
        </View>
        {error ? (
          <Text accessibilityRole="alert" className="text-ds-text-danger">
            {t("error.generic")}
          </Text>
        ) : null}
        <Button appearance="ghost" onPress={() => void logout().catch(() => setError(true))}>
          {t("auth.logout")}
        </Button>
      </View>
    </DrawerContentScrollView>
  );
}

export default function AppLayout() {
  const { isLoading, session } = useAuth();
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const organizationsVisible = useFeatureFlag(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE);
  const palette = nativeThemeTokens[resolvedTheme];
  if (isLoading)
    return (
      <View className="flex-1 items-center justify-center bg-ds-surface">
        <Text>{t("common.loadingSession")}</Text>
      </View>
    );
  if (!session) return <Redirect href="/login" />;
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.text,
        headerShadowVisible: false,
        drawerStyle: { backgroundColor: palette.background },
        drawerActiveTintColor: palette.primary,
        drawerActiveBackgroundColor: palette.selected,
        drawerInactiveTintColor: palette.text,
        sceneStyle: { backgroundColor: palette.surface }
      }}
    >
      <Drawer.Screen
        name="dashboard"
        options={{ drawerLabel: t("navigation.dashboard"), title: t("navigation.dashboard") }}
      />
      <Drawer.Screen
        name="todos/index"
        options={{ drawerLabel: t("navigation.todos"), title: t("navigation.todos") }}
      />
      <Drawer.Protected guard={organizationsVisible}>
        <Drawer.Screen
          name="members"
          options={{ drawerLabel: t("navigation.members"), title: t("navigation.members") }}
        />
      </Drawer.Protected>
    </Drawer>
  );
}
