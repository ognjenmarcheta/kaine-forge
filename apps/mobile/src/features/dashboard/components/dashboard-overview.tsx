import { Card, CardContent, CardHeader, CardTitle, Text } from "@repo/mobile-ui";

import { ScreenContainer } from "../../../components/screen-container";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  const { session } = useAuth();
  const { t } = useTranslation();

  return (
    <ScreenContainer>
      <Text variant="heading">{t("dashboard.title")}</Text>
      <Text variant="caption" className="mt-1">
        {t(DASHBOARD_DEFINITION.subtitleKey)}
      </Text>

      <Card className="mt-4">
        <CardHeader>
          <Text variant="caption">{t("dashboard.signedInAs")}</Text>
          <CardTitle>{session?.user.name ?? t("dashboard.unknownUser")}</CardTitle>
        </CardHeader>
        <CardContent className="mt-2">
          <Text variant="caption">{session?.user.email ?? "-"}</Text>
        </CardContent>
      </Card>
    </ScreenContainer>
  );
}
