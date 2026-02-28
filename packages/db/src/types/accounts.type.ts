import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { accountsTable } from "../schema/accounts.schema";

export type Account = InferSelectModel<typeof accountsTable>;
export type NewAccount = InferInsertModel<typeof accountsTable>;
