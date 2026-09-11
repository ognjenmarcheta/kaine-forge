import { FEATURE_FLAGS, useFeatureFlag } from "@repo/feature-flags";
import { Button, Text } from "@repo/mobile-ui";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";

import { ScreenContainer } from "../../../components/screen-container";
import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  const { t } = useTranslation();
  const router = useRouter();
  const { organizations, activeOrganizationId } = useOrganization();
  const visible = useFeatureFlag(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE);
  const organization = organizations.find((item) => item.id === activeOrganizationId);
  return (
    <ScreenContainer>
      <ScrollView>
        <View className="gap-3 py-4">
          {visible && organization ? <Text variant="caption">{organization.name}</Text> : null}
          <Text variant="heading">{t("dashboard.title")}</Text>
          <Text variant="caption">{t(DASHBOARD_DEFINITION.subtitleKey)}</Text>
        </View>
        <View className="mt-4 gap-4 rounded-md border border-ds-border bg-ds-bg-selected p-4">
          <Text variant="subheading">{t("navigation.todos")}</Text>
          <Text variant="caption">{t("dashboard.todosDescription")}</Text>
          <Button onPress={() => router.push(DASHBOARD_DEFINITION.todosRoute)}>
            {t("navigation.todos")}
          </Button>
        </View>
        {visible ? (
          <Button
            className="mt-4"
            appearance="secondary"
            onPress={() => router.push(DASHBOARD_DEFINITION.membersRoute)}
          >
            {t("navigation.members")}
          </Button>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
