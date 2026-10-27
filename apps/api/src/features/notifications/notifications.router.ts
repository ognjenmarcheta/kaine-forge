import { filter, pipe } from "graphql-yoga";

import { isNotificationType } from "./notifications.definition";
import type { NotificationPayloadView } from "./notifications.module";
import type { ApiContext } from "../../context";
import type { PageInput } from "../../context.data";
import type { NotificationCreatedPayload } from "../../pubsub";

interface NotificationPreferenceArgs {
  input: { email: boolean; inApp: boolean; type: string };
}

export const notificationsResolvers = {
  Query: {
    async notifications(_parent: unknown, args: PageInput, ctx: ApiContext) {
      return ctx.notifications.list(args);
    },
    async notificationPreferences(_parent: unknown, _args: unknown, ctx: ApiContext) {
      return ctx.notifications.preferences();
    }
  },
  Mutation: {
    async markNotificationRead(_parent: unknown, args: { id: string }, ctx: ApiContext) {
      return ctx.notifications.markRead(args.id);
    },
    async markAllNotificationsRead(_parent: unknown, _args: unknown, ctx: ApiContext) {
      return ctx.notifications.markAllRead();
    },
    async updateNotificationPreference(
      _parent: unknown,
      { input }: NotificationPreferenceArgs,
      ctx: ApiContext
    ) {
      // The NotificationType enum admits registered types only.
      if (!isNotificationType(input.type)) {
        throw new Error("unknown notification type");
      }

      return ctx.notifications.setPreference({ ...input, type: input.type });
    }
  },
  NotificationPayload: {
    __resolveType: (payload: NotificationPayloadView) => payload.graphqlType
  },
  Subscription: {
    notificationReceived: {
      // Filtered by recipient, not by Active Organization: an Invitation
      // names an Organization the user is not a member of yet.
      subscribe(
        _parent: unknown,
        _args: unknown,
        ctx: Pick<ApiContext, "pubsub" | "requireUserId">
      ) {
        const userId = ctx.requireUserId();
        return pipe(
          ctx.pubsub.subscribe("notification:created"),
          filter((payload: NotificationCreatedPayload) => payload.userId === userId)
        );
      },
      resolve: (payload: NotificationCreatedPayload) => payload.notification
    }
  }
};
