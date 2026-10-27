import { db, membersTable, organizationsTable } from "@repo/db";
import { asc, eq, inArray } from "drizzle-orm";

import { ORGANIZATION_ROLES } from "./auth.permissions";

// Why the server refuses to delete an account. Each value is also the
// better-auth error code the web app translates.
export const ACCOUNT_DELETION_REFUSALS = {
  PERSONAL_ORGANIZATION_HAS_MEMBERS: "PERSONAL_ORGANIZATION_HAS_MEMBERS",
  SOLE_OWNER_OF_SHARED_ORGANIZATION: "SOLE_OWNER_OF_SHARED_ORGANIZATION"
} as const;

export interface AccountDeletionRefusal {
  code: (typeof ACCOUNT_DELETION_REFUSALS)[keyof typeof ACCOUNT_DELETION_REFUSALS];
  organizationName: string;
}

type Executor = Pick<typeof db, "select">;

interface DeletionPlan {
  /** Organizations whose `user_id` moves to another member before the delete. */
  handovers: { organizationId: string; userId: string }[];
  refusal: AccountDeletionRefusal | null;
}

// better-auth stores several roles as one comma-separated value.
function isOwner(role: string): boolean {
  return role.split(",").includes(ORGANIZATION_ROLES.OWNER);
}

// Every Organization the user belongs to or created, oldest first, with all
// of its members. `lock` takes row locks on the Organizations.
async function planAccountDeletion(
  executor: Executor,
  userId: string,
  lock: boolean
): Promise<DeletionPlan> {
  const memberships = await executor
    .select({ organizationId: membersTable.organizationId })
    .from(membersTable)
    .where(eq(membersTable.userId, userId));
  const created = await executor
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  const organizationIds = [
    ...new Set([...memberships.map((row) => row.organizationId), ...created.map((row) => row.id)])
  ];
  const plan: DeletionPlan = { handovers: [], refusal: null };

  if (organizationIds.length === 0) {
    return plan;
  }

  const organizationsQuery = executor
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      personal: organizationsTable.personal,
      userId: organizationsTable.userId
    })
    .from(organizationsTable)
    .where(inArray(organizationsTable.id, organizationIds))
    .orderBy(asc(organizationsTable.createdAt));
  const organizations = await (lock ? organizationsQuery.for("update") : organizationsQuery);
  const members = await executor
    .select({
      organizationId: membersTable.organizationId,
      role: membersTable.role,
      userId: membersTable.userId
    })
    .from(membersTable)
    .where(inArray(membersTable.organizationId, organizationIds))
    .orderBy(asc(membersTable.createdAt));

  for (const organization of organizations) {
    const ofOrganization = members.filter((member) => member.organizationId === organization.id);
    const others = ofOrganization.filter((member) => member.userId !== userId);
    const own = ofOrganization.find((member) => member.userId === userId);
    const nextOwner = others.find((member) => isOwner(member.role)) ?? others[0];

    // Alone in it: the user delete cascades the Organization away.
    if (!nextOwner) {
      continue;
    }

    if (own && isOwner(own.role) && !isOwner(nextOwner.role)) {
      plan.refusal = {
        code: organization.personal
          ? ACCOUNT_DELETION_REFUSALS.PERSONAL_ORGANIZATION_HAS_MEMBERS
          : ACCOUNT_DELETION_REFUSALS.SOLE_OWNER_OF_SHARED_ORGANIZATION,
        organizationName: organization.name
      };
      return plan;
    }

    if (organization.userId === userId) {
      plan.handovers.push({ organizationId: organization.id, userId: nextOwner.userId });
    }
  }

  return plan;
}

/** Why the user's account cannot be deleted now, or null when it can. */
export async function findAccountDeletionRefusal(
  userId: string
): Promise<AccountDeletionRefusal | null> {
  return (await planAccountDeletion(db, userId, false)).refusal;
}

/**
 * Readies the user's Organizations for the account delete in one transaction
 * that locks them: refuses while the user is the only owner of an
 * Organization with other members, and otherwise hands `organizations.user_id`
 * of every Organization with another member to another owner (or the oldest
 * other member). The user delete then cascades away only the Organizations
 * the user was alone in. Returns the refusal, or null when the delete may go on.
 */
export async function prepareAccountDeletion(
  userId: string
): Promise<AccountDeletionRefusal | null> {
  return db.transaction(async (tx) => {
    const plan = await planAccountDeletion(tx, userId, true);

    if (plan.refusal) {
      return plan.refusal;
    }

    for (const handover of plan.handovers) {
      await tx
        .update(organizationsTable)
        .set({ userId: handover.userId })
        .where(eq(organizationsTable.id, handover.organizationId));
    }

    return null;
  });
}
