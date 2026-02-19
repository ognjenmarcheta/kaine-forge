import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { invitationsTable, membersTable, organizationsTable } from "../schema";

export type Organization = InferSelectModel<typeof organizationsTable>;
export type NewOrganization = InferInsertModel<typeof organizationsTable>;

export type Member = InferSelectModel<typeof membersTable>;
export type NewMember = InferInsertModel<typeof membersTable>;

export type Invitation = InferSelectModel<typeof invitationsTable>;
export type NewInvitation = InferInsertModel<typeof invitationsTable>;
