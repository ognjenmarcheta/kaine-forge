import { AUDIT_ACTION_TARGETS } from "@repo/auth/audit.definition";

// The enum lists every action recordAuditEvent accepts, so the two cannot drift.
export const auditTypeDefs = /* GraphQL */ `
  enum AuditAction {
    ${Object.keys(AUDIT_ACTION_TARGETS).join("\n    ")}
  }

  type AuditActor {
    id: ID!
    name: String!
    email: String!
  }

  type AuditEvent {
    id: ID!
    action: AuditAction!
    # Null for a system action or an actor whose account no longer exists.
    actor: AuditActor
    targetType: String!
    targetId: ID!
    # An email or name that identifies the target, when the event recorded one.
    targetLabel: String
    ipAddress: String
    userAgent: String
    createdAt: DateTime!
  }

  type AuditEventPage {
    events: [AuditEvent!]!
    # Pass as after to read the next page; null when there is none.
    endCursor: String
    hasNextPage: Boolean!
  }

  extend type Query {
    # The Active Organization's Audit Events, newest first. Owners and admins only.
    auditEvents(first: Int, after: String): AuditEventPage!
  }
`;
