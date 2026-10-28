import { Text } from "@repo/mobile-ui";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { ScrollView, View } from "react-native";

import { ScreenContainer } from "../../components/screen-container";
import { useGetMobileBillingQuery } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

/**
 * The Active Organization's Plan and usage, read-only. Checkout stays on the
 * web app: no purchase link, so no app store payment rule applies.
 */
export function BillingRoute() {
  const { language, t } = useTranslation();
  const { activeOrganizationId, isLoading } = useOrganization();
  const billing = useGetMobileBillingQuery(undefined, {
    queryKey: createActiveOrganizationQueryKey(
      useGetMobileBillingQuery.getKey(),
      activeOrganizationId
    ),
    enabled: Boolean(activeOrganizationId) && !isLoading
  });
  const status = billing.data?.billing;
  const count = new Intl.NumberFormat(language);
  const usageLine = (limit: { key: string; max?: number | null; used: number }): string => {
    const usage =
      limit.max === null || limit.max === undefined
        ? `${count.format(limit.used)}, ${t("billing.noLimit")}`
        : `${count.format(limit.used)} ${t("billing.of")} ${count.format(limit.max)}`;
    return `${t(`billing.limit.${limit.key}`)}: ${usage}`;
  };

  return (
    <ScreenContainer>
      <ScrollView>
        <View className="gap-3 py-4">
          <Text variant="heading">{t("billing.title")}</Text>
          {billing.isPending ? <Text variant="caption">{t("billing.loading")}</Text> : null}
          {billing.isError ? <Text variant="caption">{t("billing.error.load")}</Text> : null}
          {status?.provider === "none" ? <Text variant="caption">{t("billing.off")}</Text> : null}
          {status && status.provider !== "none" ? (
            <>
              <Text variant="caption">{t("billing.current")}</Text>
              <Text variant="subheading">{t(`billing.plan.${status.plan}`)}</Text>
              {status.subscriptionStatus ? (
                <Text variant="caption">{t(`billing.status.${status.subscriptionStatus}`)}</Text>
              ) : null}
              {status.subscriptionStatus === "past_due" ? (
                <Text variant="caption">{t("billing.pastDue")}</Text>
              ) : null}
              {status.limits.map((limit) => (
                <Text key={limit.key} variant="caption">
                  {usageLine(limit)}
                </Text>
              ))}
              <Text variant="caption">{t("billing.manageOnWeb")}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
