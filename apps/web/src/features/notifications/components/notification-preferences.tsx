import { Checkbox, QueryError, SettingsSection } from "@repo/ui";
import { toast } from "sonner";

import { LoadingRows } from "../../../components/loading-rows";
import type { NotificationType } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { useNotificationPreferences } from "../notifications.hook";

type Channel = "email" | "inApp";

const CHANNELS: readonly Channel[] = ["inApp", "email"];
// A type whose email always goes out, such as an Invitation, offers in-app only.
const IN_APP_ONLY: readonly Channel[] = ["inApp"];

/** Account settings: the in-app and email channels of each notification type. */
export function NotificationPreferences() {
  const { t } = useTranslation();
  const { preferences, update } = useNotificationPreferences();

  const toggle = (
    preference: { email: boolean; inApp: boolean; type: NotificationType },
    channel: Channel,
    on: boolean
  ) =>
    update.mutate(
      {
        input: {
          email: preference.email,
          inApp: preference.inApp,
          type: preference.type,
          [channel]: on
        }
      },
      { onSuccess: () => toast.success(t("notifications.preferences.saved")) }
    );

  return (
    <SettingsSection
      description={t("notifications.preferences.description")}
      title={t("notifications.preferences.title")}
    >
      {preferences.status === "pending" ? (
        <LoadingRows label={t("notifications.preferences.loading")} />
      ) : null}
      {preferences.status === "error" ? (
        <QueryError
          message={t("notifications.preferences.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void preferences.refetch()}
        />
      ) : null}
      {update.isError ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("notifications.preferences.saveError")}
        </p>
      ) : null}
      {preferences.data ? (
        <div className="ui-work-list">
          {preferences.data.notificationPreferences.map((preference) => {
            const typeLabel = t(`notifications.preferences.type.${preference.type}`);

            return (
              <fieldset
                key={preference.type}
                className="ui-work-row flex flex-wrap items-center justify-between gap-[var(--ds-space-150)]"
              >
                <legend className="sr-only">{typeLabel}</legend>
                <span aria-hidden="true" className="text-body text-[color:var(--ds-text)]">
                  {typeLabel}
                </span>
                <span className="flex flex-wrap gap-[var(--ds-space-200)]">
                  {(preference.emailAvailable ? CHANNELS : IN_APP_ONLY).map((channel) => {
                    const id = `notification-${preference.type}-${channel}`;

                    return (
                      <span key={channel} className="flex items-center gap-[var(--ds-space-075)]">
                        <Checkbox
                          id={id}
                          checked={preference[channel]}
                          disabled={update.isPending}
                          onCheckedChange={(checked) =>
                            toggle(preference, channel, checked === true)
                          }
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
                  {preference.emailAvailable ? null : (
                    <span className="text-body-sm text-[color:var(--ds-text-subtle)]">
                      {t("notifications.preferences.emailAlwaysSent")}
                    </span>
                  )}
                </span>
              </fieldset>
            );
          })}
        </div>
      ) : null}
    </SettingsSection>
  );
}
