import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { invitationsTable, membersTable, organizationsTable } from "../schema";

export const selectOrganizationSchema = createSelectSchema(organizationsTable);
export const insertOrganizationSchema = createInsertSchema(organizationsTable);

export const selectMemberSchema = createSelectSchema(membersTable);
export const insertMemberSchema = createInsertSchema(membersTable);

export const selectInvitationSchema = createSelectSchema(invitationsTable);
export const insertInvitationSchema = createInsertSchema(invitationsTable);
