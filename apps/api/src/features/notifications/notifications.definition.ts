import type { NotificationPayloadByType, NotificationType } from "@repo/auth/notifications";
import { z } from "zod";

export const NOTIFICATION_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 50
  }
} as const;

/** Where a Notification goes: the in-app inbox, an email, both, or neither. */
export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
}

interface NotificationDefinition<TType extends NotificationType> {
  /** The GraphQL object type of the payload in the `NotificationPayload` union. */
  graphqlType: string;
  /** The channels a user gets until they choose their own. */
  defaults: NotificationChannels;
  /**
   * False for a type whose email the producer always sends itself; the
   * email channel then stays off and the user cannot turn it on.
   */
  emailAvailable: boolean;
  /** Parses a stored payload; a row that fails is left out of the inbox. */
  payload: z.ZodType<NotificationPayloadByType[TType]>;
}

/**
 * Every notification type. Producers in @repo/auth emit the payloads; this
 * registry decides how each one is stored, shown, and delivered by default.
 */
export const NOTIFICATION_TYPES: { [TType in NotificationType]: NotificationDefinition<TType> } = {
  // The invitation email delivers the Invitation itself and always goes to
  // the invited address, so this type is in-app only.
  invitation_received: {
    graphqlType: "InvitationReceivedNotification",
    defaults: { inApp: true, email: false },
    emailAvailable: false,
    payload: z.object({
      invitationId: z.string(),
      inviterName: z.string(),
      organizationName: z.string(),
      role: z.string()
    })
  },
  role_changed: {
    graphqlType: "RoleChangedNotification",
    defaults: { inApp: true, email: true },
    emailAvailable: true,
    payload: z.object({ organizationName: z.string(), role: z.string() })
  }
};

export function isNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, value);
}
