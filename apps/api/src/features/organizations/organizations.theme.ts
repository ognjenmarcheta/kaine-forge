import type { AuditEventInput } from "@repo/auth/audit";
import {
  requireOrganizationPermission,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";
import { organizationsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { isThemeName, resolveThemeName } from "@repo/theme";
import { and, eq, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";

/** The Active Organization's Organization Theme. Members with organization:update change it. */
export interface OrganizationThemes {
  /** The theme name to apply: the default theme when none is stored or the stored one is gone. */
  current: () => Promise<string>;
  /** Stores a registered theme name, or null for the default theme, and returns the theme to apply. */
  set: (theme: string | null) => Promise<string>;
}

export interface OrganizationThemesDeps {
  db: Database;
  recordAuditEvent: (event: AuditEventInput) => Promise<void>;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}

export function createOrganizationThemes({
  db,
  recordAuditEvent,
  requireOrganizationScope
}: OrganizationThemesDeps): OrganizationThemes {
  return {
    async current() {
      const scope = requireOrganizationScope();
      const [organization] = await db
        .select({ theme: organizationsTable.theme })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, scope.organizationId));

      return resolveThemeName(organization?.theme);
    },
    async set(theme) {
      const scope = requireOrganizationScope();

      requireOrganizationPermission(scope, "organization:update");

      if (theme !== null && !isThemeName(theme)) {
        throw new GraphQLError("theme is not registered", {
          extensions: { code: "BAD_USER_INPUT" }
        });
      }

      // An unchanged theme updates no row, so a repeat records no Audit Event.
      const changed = await db
        .update(organizationsTable)
        .set({ theme })
        .where(
          and(
            eq(organizationsTable.id, scope.organizationId),
            sql`${organizationsTable.theme} is distinct from ${theme}`
          )
        )
        .returning({ id: organizationsTable.id });

      if (changed.length > 0) {
        await recordAuditEvent({
          action: "organization_theme_changed",
          actorUserId: scope.userId,
          metadata: { theme },
          organizationId: scope.organizationId,
          targetId: scope.organizationId
        });
      }

      return resolveThemeName(theme);
    }
  };
}
