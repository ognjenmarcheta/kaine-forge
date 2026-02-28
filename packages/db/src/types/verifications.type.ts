import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { verificationsTable } from "../schema/verifications.schema";

export type Verification = InferSelectModel<typeof verificationsTable>;
export type NewVerification = InferInsertModel<typeof verificationsTable>;
