export const webhooksTypeDefs = /* GraphQL */ `
  type WebhookEndpoint {
    id: ID!
    url: String!
    # Event types from webhookEventTypes, such as todo:created.
    eventTypes: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type WebhookEndpointConnection {
    items: [WebhookEndpoint!]!
    pageInfo: PageInfo!
  }

  # A new endpoint and its signing secret, returned only by createWebhookEndpoint.
  type CreatedWebhookEndpoint {
    endpoint: WebhookEndpoint!
    secret: String!
  }

  # One delivery attempt of one event.
  type WebhookDelivery {
    id: ID!
    eventId: ID!
    eventType: String!
    attempt: Int!
    # Null when no response arrived.
    statusCode: Int
    durationMs: Int!
    # blocked_address, timeout, network, or http_status; null for a 2xx.
    error: String
    createdAt: DateTime!
  }

  type WebhookDeliveryConnection {
    items: [WebhookDelivery!]!
    pageInfo: PageInfo!
  }

  input WebhookEndpointInput {
    # An HTTPS URL whose host resolves to public addresses only.
    url: String!
    eventTypes: [String!]!
  }

  extend type Query {
    # Every event type a Webhook Endpoint can subscribe to. Requires webhook:read.
    webhookEventTypes: [String!]!
    # The Active Organization's Webhook Endpoints, newest first. Requires webhook:read.
    webhookEndpoints(first: Int, after: String): WebhookEndpointConnection!
    # One endpoint's delivery attempts, newest first. Requires webhook:read.
    webhookDeliveries(endpointId: ID!, first: Int, after: String): WebhookDeliveryConnection!
  }

  extend type Mutation {
    # Requires webhook:create.
    createWebhookEndpoint(input: WebhookEndpointInput!): CreatedWebhookEndpoint!
    # Requires webhook:update.
    updateWebhookEndpoint(id: ID!, input: WebhookEndpointInput!): WebhookEndpoint!
    # Requires webhook:delete. False when no endpoint with this id is in the Organization.
    deleteWebhookEndpoint(id: ID!): Boolean!
  }
`;
