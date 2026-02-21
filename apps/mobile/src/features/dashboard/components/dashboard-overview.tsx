import { Text, View } from "react-native";

import { ScreenContainer } from "../../../components/screen-container";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  const { session } = useAuth();
  const { t } = useTranslation();

  return (
    <ScreenContainer>
      <Text className="text-2xl font-semibold text-ds-text">{t("dashboard.title")}</Text>
      <Text className="mt-1 text-sm text-ds-text-subtle">
        {t(DASHBOARD_DEFINITION.subtitleKey)}
      </Text>

      <View className="mt-4 rounded-xl bg-ds-surface p-4 shadow-raised">
        <Text className="text-sm text-ds-text-subtle">{t("dashboard.signedInAs")}</Text>
        <Text className="mt-1 text-base font-medium text-ds-text">
          {session?.user.name ?? t("dashboard.unknownUser")}
        </Text>
        <Text className="text-sm text-ds-text-subtle">{session?.user.email ?? "-"}</Text>
      </View>
    </ScreenContainer>
  );
}
