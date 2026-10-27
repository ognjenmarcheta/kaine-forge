import type { NotificationDispatcher } from "@repo/auth/notifications";
import { notificationsTable, usersTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { EmailTemplate } from "@repo/email";
import { eq } from "drizzle-orm";

import { resolveChannels, toNotificationView } from "./notifications.module";
import type { NotificationCreatedPayload } from "../../pubsub";

export interface NotificationDeliveryDeps {
  db: Database;
  /** Streams a new in-app Notification to its recipient's open subscriptions. */
  publish: (payload: NotificationCreatedPayload) => void;
  /** Queues one email through the job runner (#703 templates). */
  sendEmail: (to: string, email: EmailTemplate, locale: string | null) => Promise<void>;
}

/**
 * Delivers each event on the channels its recipient keeps on: in-app stores
 * the Notification and streams it, email sends the event's template in the
 * recipient's language. A channel that is off delivers nothing. Errors reach
 * `dispatchNotification`, which logs them; the producing action never waits.
 */
export function createNotificationDelivery({
  db,
  publish,
  sendEmail
}: NotificationDeliveryDeps): NotificationDispatcher {
  return async (event) => {
    const channels = await resolveChannels(db, event.recipientUserId, event.type);

    const inApp = async () => {
      const [row] = await db
        .insert(notificationsTable)
        .values({
          organizationId: event.organizationId,
          payload: event.payload,
          type: event.type,
          userId: event.recipientUserId
        })
        .returning();
      const notification = row ? toNotificationView(row) : null;

      if (notification) {
        publish({ notification, userId: event.recipientUserId });
      }
    };

    const email = async () => {
      const [recipient] = await db
        .select({ email: usersTable.email, locale: usersTable.locale })
        .from(usersTable)
        .where(eq(usersTable.id, event.recipientUserId))
        .limit(1);

      if (recipient) {
        await sendEmail(recipient.email, event.email, recipient.locale);
      }
    };

    await Promise.all([channels.inApp ? inApp() : null, channels.email ? email() : null]);
  };
}
