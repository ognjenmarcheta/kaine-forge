import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { NOTIFICATIONS_CONFIG } from "./notifications.config";
import { OnNotificationReceivedDocument } from "../../graphql/generated/graphql";
import {
  NotificationsDocument,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationPreferencesQuery,
  useNotificationsQuery,
  useUpdateNotificationPreferenceMutation,
  type NotificationsQuery,
  type NotificationsQueryVariables
} from "../../graphql/generated/react-query";
import { useSubscription } from "../../hooks/use-subscription";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";

/** The `after` cursor of the first page: none. */
const FIRST_PAGE: string | null = null;

// Notifications belong to the user, not the Active Organization, so the key
// is not organization-scoped and survives an organization switch.
const INBOX_KEY = [
  ...useNotificationsQuery.getKey({ first: NOTIFICATIONS_CONFIG.pageSize }),
  "pages"
] as const;

/** The signed-in user's inbox, newest first, kept live by the notification subscription. */
export function useNotificationInbox() {
  const queryClient = useQueryClient();
  const fetchNotifications = useGraphqlFetcher<NotificationsQuery, NotificationsQueryVariables>(
    NotificationsDocument
  );
  const inbox = useInfiniteQuery({
    queryKey: INBOX_KEY,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      fetchNotifications({ after: pageParam, first: NOTIFICATIONS_CONFIG.pageSize }),
    getNextPageParam: ({ notifications: { pageInfo } }) =>
      pageInfo.hasNextPage ? pageInfo.endCursor : undefined
  });
  useSubscription({ query: OnNotificationReceivedDocument, invalidateKeys: [INBOX_KEY] });

  const refresh = () => queryClient.invalidateQueries({ queryKey: INBOX_KEY });
  const markRead = useMarkNotificationReadMutation({ onSuccess: refresh });
  const markAllRead = useMarkAllNotificationsReadMutation({ onSuccess: refresh });

  return {
    inbox,
    items: inbox.data?.pages.flatMap((page) => page.notifications.items) ?? [],
    // The first page carries the count of every unread Notification.
    unreadCount: inbox.data?.pages[0]?.notifications.unreadCount ?? 0,
    markRead: (id: string) => markRead.mutate({ id }),
    markAllRead: () => markAllRead.mutate({})
  };
}

/** The user's channels per notification type, and a setter that saves one type. */
export function useNotificationPreferences() {
  const queryClient = useQueryClient();
  const preferences = useNotificationPreferencesQuery();
  const update = useUpdateNotificationPreferenceMutation({
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: useNotificationPreferencesQuery.getKey() })
  });

  return { preferences, update };
}
