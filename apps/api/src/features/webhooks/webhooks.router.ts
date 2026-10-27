import type { WebhookEndpointInput } from "./webhooks.module";
import type { ApiContext } from "../../context";
import type { PageInput } from "../../context.data";

export const webhooksResolvers = {
  Query: {
    webhookEventTypes(_parent: unknown, _args: unknown, ctx: ApiContext) {
      return ctx.webhooks.eventTypes();
    },
    webhookEndpoints(_parent: unknown, args: PageInput, ctx: ApiContext) {
      return ctx.webhooks.list(args);
    },
    webhookDeliveries(
      _parent: unknown,
      { endpointId, ...page }: PageInput & { endpointId: string },
      ctx: ApiContext
    ) {
      return ctx.webhooks.deliveries(endpointId, page);
    }
  },
  Mutation: {
    createWebhookEndpoint(
      _parent: unknown,
      args: { input: WebhookEndpointInput },
      ctx: ApiContext
    ) {
      return ctx.webhooks.create(args.input);
    },
    updateWebhookEndpoint(
      _parent: unknown,
      args: { id: string; input: WebhookEndpointInput },
      ctx: ApiContext
    ) {
      return ctx.webhooks.update(args.id, args.input);
    },
    deleteWebhookEndpoint(_parent: unknown, args: { id: string }, ctx: ApiContext) {
      return ctx.webhooks.delete(args.id);
    }
  }
};
