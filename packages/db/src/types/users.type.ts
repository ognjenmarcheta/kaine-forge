import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { usersTable } from "../schema/users.schema";

export type User = InferSelectModel<typeof usersTable>;
export type NewUser = InferInsertModel<typeof usersTable>;
