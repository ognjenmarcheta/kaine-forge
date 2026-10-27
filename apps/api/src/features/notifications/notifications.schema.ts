import { NOTIFICATION_TYPES } from "./notifications.definition";

// The enum and the payload union list every registered type, so neither can
// drift from the registry.
export const notificationsTypeDefs = /* GraphQL */ `
  enum NotificationType {
    ${Object.keys(NOTIFICATION_TYPES).join("\n    ")}
  }

  type InvitationReceivedNotification {
    # Opens the Invitation at /invitations/:id; the invitee accepts it there.
    invitationId: ID!
    inviterName: String!
    organizationName: String!
    role: String!
  }

  type RoleChangedNotification {
    organizationName: String!
    role: String!
  }

  union NotificationPayload = ${Object.values(NOTIFICATION_TYPES)
    .map((definition) => definition.graphqlType)
    .join(" | ")}

  type Notification {
    id: ID!
    type: NotificationType!
    # The Organization the Notification is about, if any.
    organizationId: ID
    payload: NotificationPayload!
    readAt: DateTime
    createdAt: DateTime!
  }

  type NotificationConnection {
    items: [Notification!]!
    pageInfo: PageInfo!
    # Every unread Notification of the caller, not only this page.
    unreadCount: Int!
  }

  type NotificationPreference {
    type: NotificationType!
    inApp: Boolean!
    email: Boolean!
    # False for a type whose email always goes out, such as the invitation
    # email; email then stays false and cannot be turned on.
    emailAvailable: Boolean!
  }

  input NotificationPreferenceInput {
    type: NotificationType!
    inApp: Boolean!
    email: Boolean!
  }

  extend type Query {
    # The caller's own Notifications, newest first, in every Organization.
    notifications(first: Int, after: String): NotificationConnection!
    # The caller's channels for every notification type.
    notificationPreferences: [NotificationPreference!]!
  }

  extend type Mutation {
    # Fails with "notification not found" for another user's Notification.
    markNotificationRead(id: ID!): Notification!
    # Marks every unread Notification of the caller; returns how many.
    markAllNotificationsRead: Int!
    updateNotificationPreference(input: NotificationPreferenceInput!): NotificationPreference!
  }

  extend type Subscription {
    # New in-app Notifications of the caller, whatever their Active Organization.
    notificationReceived: Notification!
  }
`;
