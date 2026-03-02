import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { filesTable } from "../schema/files.schema";

export type File = InferSelectModel<typeof filesTable>;
export type NewFile = InferInsertModel<typeof filesTable>;
