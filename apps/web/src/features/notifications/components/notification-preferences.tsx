import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox } from "@repo/ui";

import { LoadingRows } from "../../../components/loading-rows";
import type { NotificationType } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { useNotificationPreferences } from "../notifications.hook";

type Channel = "email" | "inApp";

/** Account settings: the in-app and email channels of each notification type. */
export function NotificationPreferences() {
  const { t } = useTranslation();
  const { preferences, update } = useNotificationPreferences();

  const toggle = (
    preference: { email: boolean; inApp: boolean; type: NotificationType },
    channel: Channel,
    on: boolean
  ) =>
    update.mutate({
      input: {
        email: preference.email,
        inApp: preference.inApp,
        type: preference.type,
        [channel]: on
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notifications.preferences.title")}</CardTitle>
        <CardDescription>{t("notifications.preferences.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-[var(--ds-space-150)]">
        {preferences.status === "pending" ? (
          <LoadingRows label={t("notifications.preferences.loading")} />
        ) : null}
        {preferences.status === "error" ? (
          <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
            {t("notifications.preferences.error")}
          </p>
        ) : null}
        {update.isError ? (
          <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
            {t("notifications.preferences.saveError")}
          </p>
        ) : null}
        {preferences.data?.notificationPreferences.map((preference) => {
          const typeLabel = t(`notifications.preferences.type.${preference.type}`);

          return (
            <fieldset
              key={preference.type}
              className="flex flex-wrap items-center justify-between gap-[var(--ds-space-100)] rounded-[var(--ds-radius-100)] border border-[var(--ds-border)] p-[var(--ds-space-150)]"
            >
              <legend className="sr-only">{typeLabel}</legend>
              <span aria-hidden="true" className="text-body text-[color:var(--ds-text)]">
                {typeLabel}
              </span>
              <span className="flex flex-wrap gap-[var(--ds-space-200)]">
                {(["inApp", "email"] as const).map((channel) => {
                  const id = `notification-${preference.type}-${channel}`;

                  return (
                    <span key={channel} className="flex items-center gap-[var(--ds-space-075)]">
                      <Checkbox
                        id={id}
                        checked={preference[channel]}
                        disabled={update.isPending}
                        onCheckedChange={(checked) => toggle(preference, channel, checked === true)}
                      />
                      <label htmlFor={id} className="text-body text-[color:var(--ds-text)]">
                        {t(
                          channel === "inApp"
                            ? "notifications.preferences.inApp"
                            : "notifications.preferences.email"
                        )}
                      </label>
                    </span>
                  );
                })}
              </span>
            </fieldset>
          );
        })}
      </CardContent>
    </Card>
  );
}
