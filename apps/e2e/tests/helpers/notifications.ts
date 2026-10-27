import { connection } from "./connection";

/**
 * The app shell's notification operations answered with an empty inbox and
 * the default channels, or null for any other operation. Every GraphQL mock
 * that renders the shell answers these, so the header bell has data.
 */
export function notificationData(query: string): Record<string, unknown> | null {
  if (query.includes("query Notifications(")) {
    return { notifications: { ...connection([]), unreadCount: 0 } };
  }

  if (query.includes("query NotificationPreferences")) {
    return {
      notificationPreferences: [
        { type: "invitation_received", inApp: true, email: false, emailAvailable: false },
        { type: "role_changed", inApp: true, email: true, emailAvailable: true }
      ]
    };
  }

  if (query.includes("mutation MarkAllNotificationsRead")) {
    return { markAllNotificationsRead: 0 };
  }

  return null;
}
