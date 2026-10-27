/**
 * The metadata each Audit Event action records. Values name what changed and
 * never hold a password, token, or secret.
 */
export interface AuditEventMetadataByAction {
  member_invited: { email: string; role: string };
  member_joined: { email: string; role: string };
  member_removed: { email: string | null; role: string };
  member_left: { role: string };
  member_role_changed: { email: string | null; role: string };
  ownership_transferred: { email: string | null };
  organization_renamed: { name: string };
  organization_deleted: { name: string };
  invitation_revoked: { email: string };
  two_factor_enabled: Record<string, never>;
  two_factor_disabled: Record<string, never>;
  password_changed: Record<string, never>;
  attachment_deleted: { originalName: string };
  /** `enabled` is null when the override was cleared. */
  feature_flag_override_changed: { flag: string; enabled: boolean | null };
  /** `permissions` lists the granted Permissions, comma-separated, in catalog order. */
  role_created: { name: string; permissions: string };
  role_updated: { name: string; permissions: string };
  role_deleted: { name: string };
  api_key_created: { name: string };
  api_key_revoked: { name: string };
  webhook_endpoint_created: { url: string; eventTypes: string };
  webhook_endpoint_updated: { url: string; eventTypes: string };
  webhook_endpoint_deleted: { url: string };
  webhook_secret_rotated: { url: string };
}

export type AuditAction = keyof AuditEventMetadataByAction;

export type AuditTargetType =
  | "api_key"
  | "attachment"
  | "invitation"
  | "member"
  | "organization"
  | "role"
  | "user"
  | "webhook_endpoint";

/** Actions about a User's own account: they belong to no Organization. */
type UserAuditAction = "two_factor_enabled" | "two_factor_disabled" | "password_changed";

/** What each action acts on; the target id names a row of this kind. */
export const AUDIT_ACTION_TARGETS: { readonly [TAction in AuditAction]: AuditTargetType } = {
  member_invited: "invitation",
  member_joined: "member",
  member_removed: "member",
  member_left: "member",
  member_role_changed: "member",
  ownership_transferred: "member",
  organization_renamed: "organization",
  organization_deleted: "organization",
  invitation_revoked: "invitation",
  two_factor_enabled: "user",
  two_factor_disabled: "user",
  password_changed: "user",
  attachment_deleted: "attachment",
  feature_flag_override_changed: "organization",
  role_created: "role",
  role_updated: "role",
  role_deleted: "role",
  api_key_created: "api_key",
  api_key_revoked: "api_key",
  webhook_endpoint_created: "webhook_endpoint",
  webhook_endpoint_updated: "webhook_endpoint",
  webhook_endpoint_deleted: "webhook_endpoint",
  webhook_secret_rotated: "webhook_endpoint"
};

export function isAuditAction(value: string): value is AuditAction {
  return Object.hasOwn(AUDIT_ACTION_TARGETS, value);
}

export type AuditEventInput = {
  [TAction in AuditAction]: {
    action: TAction;
    /** Null for a system action. */
    actorUserId: string | null;
    metadata: AuditEventMetadataByAction[TAction];
    /**
     * From the caller's Authenticated Organization Scope or the better-auth
     * hook's Organization, never from client input. Null for a user-level action.
     */
    organizationId: TAction extends UserAuditAction ? null : string;
    targetId: string;
  };
}[AuditAction];
