/**
 * The API's organizationPermissions answer for a member of the Active
 * Organization. Helpers that mock every GraphQL operation return it, because
 * the app shell reads the caller's Permissions to show the audit-log link.
 */
export const ORGANIZATION_PERMISSIONS_RESPONSE = {
  data: {
    organizationPermissions: [
      "ac:read",
      "todo:create",
      "todo:update",
      "todo:delete",
      "note:create",
      "note:update",
      "note:delete",
      "attachment:create",
      "attachment:delete"
    ]
  }
};
