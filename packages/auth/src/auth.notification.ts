import type { EmailTemplate } from "@repo/email";
import { createLogger } from "@repo/logger";

/**
 * What each notification type tells its recipient. Values are text, ids, and
 * role names only: a payload never carries an invitation secret or a link.
 */
export interface NotificationPayloadByType {
  invitation_received: {
    invitationId: string;
    inviterName: string;
    organizationName: string;
    role: string;
  };
  role_changed: { organizationName: string; role: string };
}

export type NotificationType = keyof NotificationPayloadByType;

/** One event for one recipient; the API's notification registry decides its channels. */
export type NotificationEvent = {
  [TType in NotificationType]: {
    type: TType;
    recipientUserId: string;
    /** The Organization the Notification is about, or null. */
    organizationId: string | null;
    payload: NotificationPayloadByType[TType];
    /** What the email channel sends when the recipient keeps it on. */
    email: EmailTemplate;
  };
}[NotificationType];

export type NotificationDispatcher = (event: NotificationEvent) => Promise<void>;

const notificationLogger = createLogger({ name: "notifications" });

// The API process sets this at startup. Auth runs without it in tests and
// tools, where an invitation email goes straight to the invitee instead.
let dispatcher: NotificationDispatcher | null = null;

/** Sets who delivers Notification events; null stops delivery. */
export function setNotificationDispatcher(next: NotificationDispatcher | null): void {
  dispatcher = next;
}

export function hasNotificationDispatcher(): boolean {
  return dispatcher !== null;
}

/**
 * Hands an event to the dispatcher without awaiting it. The action that
 * produced it has already succeeded, so a failure is logged, never thrown.
 */
export function dispatchNotification(event: NotificationEvent): void {
  const current = dispatcher;

  if (!current) {
    return;
  }

  void Promise.resolve()
    .then(() => current(event))
    .catch((error: unknown) => {
      // The error can carry the payload; the log names the type only.
      notificationLogger.error(
        { type: event.type, error: error instanceof Error ? error.name : "UnknownError" },
        "notification not delivered"
      );
    });
}
