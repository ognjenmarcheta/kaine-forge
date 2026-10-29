import {
  Badge,
  Bell,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton
} from "@repo/ui";
import { useNavigate } from "react-router-dom";

import type { NotificationFieldsFragment } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { useNotificationInbox } from "../notifications.hook";

type Translate = ReturnType<typeof useTranslation>["t"];

// A built-in role reads by its translated name; a Custom Role by its own name.
function roleLabel(t: Translate, role: string): string {
  return role === "owner" || role === "admin" || role === "member"
    ? t(`notifications.role.${role}`)
    : t("notifications.role.custom").replace("{name}", role);
}

function messageOf(t: Translate, notification: NotificationFieldsFragment): string {
  const { payload } = notification;

  switch (payload.__typename) {
    case "InvitationReceivedNotification":
      return t("notifications.message.invitation_received")
        .replace("{inviterName}", payload.inviterName)
        .replace("{organizationName}", payload.organizationName)
        .replace("{role}", roleLabel(t, payload.role));
    case "RoleChangedNotification":
      return t("notifications.message.role_changed")
        .replace("{organizationName}", payload.organizationName)
        .replace("{role}", roleLabel(t, payload.role));
  }
}

/** The header bell: an unread badge and an inbox of the user's Notifications. */
export function NotificationBell() {
  const { language, t } = useTranslation();
  const navigate = useNavigate();
  const { inbox, items, markAllRead, markRead, unreadCount } = useNotificationInbox();
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });

  const open = (notification: NotificationFieldsFragment) => {
    if (!notification.readAt) {
      markRead(notification.id);
    }

    if (notification.payload.__typename === "InvitationReceivedNotification") {
      void navigate(`/invitations/${encodeURIComponent(notification.payload.invitationId)}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          appearance="ghost"
          spacing="compact"
          aria-label={
            unreadCount > 0
              ? t("notifications.bell.labelUnread").replace("{count}", String(unreadCount))
              : t("notifications.bell.label")
          }
          className="relative"
        >
          <Bell aria-hidden="true" className="size-4" />
          {unreadCount > 0 ? (
            <Badge
              appearance="danger"
              emphasis="bold"
              aria-hidden="true"
              className="absolute -right-ds-050 -top-ds-050 px-ds-050 py-0 text-body-sm"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[calc(100vw-var(--ds-space-400))] max-w-[calc(var(--ds-space-1000)*5)]"
      >
        <div className="flex items-center justify-between gap-ds-100 px-ds-100">
          <DropdownMenuLabel className="px-0">{t("notifications.inbox.title")}</DropdownMenuLabel>
          {unreadCount > 0 ? (
            <Button appearance="link" spacing="compact" onClick={markAllRead}>
              {t("notifications.inbox.markAllRead")}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {inbox.status === "pending" ? (
          <div aria-busy="true" role="status" className="grid gap-ds-100 p-ds-100">
            <span className="sr-only">{t("notifications.inbox.loading")}</span>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-ds-400 w-full" />
            ))}
          </div>
        ) : null}
        {inbox.status === "error" ? (
          <p role="alert" className="p-ds-100 text-body-sm text-ds-text-danger">
            {t("notifications.inbox.error")}
          </p>
        ) : null}
        {inbox.status === "success" && items.length === 0 ? (
          <p className="p-ds-100 text-body-sm text-ds-text-subtle">
            {t("notifications.inbox.empty")}
          </p>
        ) : null}
        {items.map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className="grid items-start gap-ds-025"
            onSelect={() => open(notification)}
          >
            <span className="flex items-start gap-ds-100">
              <span
                className={
                  notification.readAt
                    ? "text-body text-ds-text-subtle"
                    : "text-body font-semibold text-ds-text"
                }
              >
                {messageOf(t, notification)}
              </span>
              {notification.readAt ? null : (
                <Badge appearance="information">{t("notifications.inbox.unread")}</Badge>
              )}
            </span>
            <span className="text-body-sm text-ds-text-subtlest">
              {date.format(new Date(notification.createdAt))}
            </span>
          </DropdownMenuItem>
        ))}
        {inbox.hasNextPage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={inbox.isFetchingNextPage}
              onSelect={(event) => {
                // Keeps the inbox open while the next page loads.
                event.preventDefault();
                void inbox.fetchNextPage();
              }}
            >
              {t("notifications.inbox.loadMore")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
