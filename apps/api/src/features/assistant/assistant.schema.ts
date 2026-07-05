export const assistantTypeDefs = /* GraphQL */ `
  type AssistantMessage {
    id: ID!
    conversationId: ID!
    role: String!
    content: String!
    createdAt: DateTime!
  }

  type AssistantToolAction {
    tool: String!
    input: String
    output: String
  }

  enum SendMessageStatus {
    REPLIED
    AI_NOT_CONFIGURED
    FAILED
  }

  type SendMessagePayload {
    status: SendMessageStatus!
    conversationId: ID!
    reply: String
    toolActions: [AssistantToolAction!]!
    message: String
  }

  input SendMessageInput {
    conversationId: ID
    message: String!
  }

  type AssistantMessageDelta {
    conversationId: ID!
    delta: String!
  }

  extend type Query {
    assistantMessages(conversationId: ID!, limit: Int, offset: Int): [AssistantMessage!]!
  }

  extend type Mutation {
    sendMessage(input: SendMessageInput!): SendMessagePayload!
  }

  extend type Subscription {
    assistantMessageDelta: AssistantMessageDelta!
  }
`;
