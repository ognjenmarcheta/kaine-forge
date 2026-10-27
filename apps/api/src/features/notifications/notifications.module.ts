import type { NotificationPayloadByType, NotificationType } from "@repo/auth/notifications";
import { notificationPreferencesTable, notificationsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import {
  isNotificationType,
  NOTIFICATION_CONFIG,
  NOTIFICATION_TYPES,
  type NotificationChannels
} from "./notifications.definition";
import { pageOwnedByUser, type Connection, type PageInput } from "../../context.data";

/** A payload with the GraphQL type the `NotificationPayload` union resolves it to. */
export type NotificationPayloadView = {
  [TType in NotificationType]: NotificationPayloadByType[TType] & { graphqlType: string };
}[NotificationType];

export interface NotificationView {
  id: string;
  type: NotificationType;
  organizationId: string | null;
  payload: NotificationPayloadView;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationConnection extends Connection<NotificationView> {
  unreadCount: number;
}

export interface NotificationPreferenceView extends NotificationChannels {
  type: NotificationType;
  /** False when the type has no email channel to turn on. */
  emailAvailable: boolean;
}

/** The signed-in user's own Notifications and preferences, whatever their Active Organization. */
export interface Notifications {
  /** Newest first; throws `invalid cursor` for a malformed or another user's `after`. */
  list: (input: PageInput) => Promise<NotificationConnection>;
  /** Throws `notification not found` for an id the user does not own. */
  markRead: (id: string) => Promise<NotificationView>;
  /** Returns how many Notifications it marked. */
  markAllRead: () => Promise<number>;
  /** Every type, with the user's choice or the type's defaults. */
  preferences: () => Promise<NotificationPreferenceView[]>;
  setPreference: (
    input: NotificationChannels & { type: NotificationType }
  ) => Promise<NotificationPreferenceView>;
}

export interface NotificationsDeps {
  db: Database;
  /** The signed-in user's id; throws `authentication required` without a session. */
  requireUserId: () => string;
}

type NotificationRow = typeof notificationsTable.$inferSelect;

/**
 * The view of a stored row, or null for a type this release does not know
 * or a payload that no longer parses: the inbox skips it instead of failing.
 */
export function toNotificationView(row: NotificationRow): NotificationView | null {
  const type = row.type;

  if (!isNotificationType(type)) {
    return null;
  }

  const definition = NOTIFICATION_TYPES[type];
  const parsed = definition.payload.safeParse(row.payload);

  if (!parsed.success) {
    return null;
  }

  return {
    id: row.id,
    type,
    organizationId: row.organizationId,
    payload: { ...parsed.data, graphqlType: definition.graphqlType },
    readAt: row.readAt,
    createdAt: row.createdAt
  };
}

// A type without an email channel never sends email, whatever a stored row says.
function effectiveChannels(
  type: NotificationType,
  preference: NotificationChannels | undefined
): NotificationChannels {
  const definition = NOTIFICATION_TYPES[type];
  const { email, inApp } = preference ?? definition.defaults;
  return { email: definition.emailAvailable && email, inApp };
}

/** The channels a user gets for a type: their own choice, or the type's defaults. */
export async function resolveChannels(
  db: Database,
  userId: string,
  type: NotificationType
): Promise<NotificationChannels> {
  const [preference] = await db
    .select({
      email: notificationPreferencesTable.email,
      inApp: notificationPreferencesTable.inApp
    })
    .from(notificationPreferencesTable)
    .where(
      and(
        eq(notificationPreferencesTable.userId, userId),
        eq(notificationPreferencesTable.type, type)
      )
    )
    .limit(1);

  return effectiveChannels(type, preference);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notificationNotFound(): Error {
  return new Error("notification not found");
}

export function createNotifications({ db, requireUserId }: NotificationsDeps): Notifications {
  const mine = (userId: string) => eq(notificationsTable.userId, userId);

  return {
    async list(input) {
      const userId = requireUserId();
      const [page, [unread]] = await Promise.all([
        pageOwnedByUser(db, userId, notificationsTable, input, {
          orderBy: notificationsTable.createdAt,
          direction: "desc",
          limits: NOTIFICATION_CONFIG.pagination
        }),
        db
          .select({ total: count() })
          .from(notificationsTable)
          .where(and(mine(userId), isNull(notificationsTable.readAt)))
      ]);

      return {
        items: page.items.flatMap((row) => toNotificationView(row) ?? []),
        pageInfo: page.pageInfo,
        unreadCount: unread?.total ?? 0
      };
    },
    async markRead(id) {
      const userId = requireUserId();

      // A malformed id would fail the uuid comparison in Postgres.
      if (!UUID_PATTERN.test(id)) {
        throw notificationNotFound();
      }

      const owned = and(eq(notificationsTable.id, id), mine(userId));
      const [row] = await db.select().from(notificationsTable).where(owned).limit(1);

      if (!row) {
        throw notificationNotFound();
      }

      // The inbox never lists a row it cannot show, so it is left as it is.
      if (!toNotificationView(row)) {
        throw new Error("notification not readable");
      }

      // Marking an already read Notification keeps its first read time.
      const [updated] = await db
        .update(notificationsTable)
        .set({ readAt: sql`coalesce(${notificationsTable.readAt}, now())` })
        .where(owned)
        .returning();
      const view = updated ? toNotificationView(updated) : null;

      // Deleted between the read and the write.
      if (!view) {
        throw notificationNotFound();
      }

      return view;
    },
    async markAllRead() {
      const userId = requireUserId();
      const rows = await db
        .update(notificationsTable)
        .set({ readAt: sql`now()` })
        .where(and(mine(userId), isNull(notificationsTable.readAt)))
        .returning({ id: notificationsTable.id });

      return rows.length;
    },
    async preferences() {
      const userId = requireUserId();
      const rows = await db
        .select()
        .from(notificationPreferencesTable)
        .where(eq(notificationPreferencesTable.userId, userId));
      const byType = new Map(rows.map((row) => [row.type, row]));

      return Object.keys(NOTIFICATION_TYPES)
        .filter(isNotificationType)
        .map((type) => ({
          ...effectiveChannels(type, byType.get(type)),
          emailAvailable: NOTIFICATION_TYPES[type].emailAvailable,
          type
        }));
    },
    async setPreference(input) {
      const userId = requireUserId();
      const { type } = input;
      const { email, inApp } = effectiveChannels(type, input);
      await db
        .insert(notificationPreferencesTable)
        .values({ email, inApp, type, userId })
        .onConflictDoUpdate({
          target: [notificationPreferencesTable.userId, notificationPreferencesTable.type],
          set: { email, inApp, updatedAt: sql`now()` }
        });

      return { email, emailAvailable: NOTIFICATION_TYPES[type].emailAvailable, inApp, type };
    }
  };
}
