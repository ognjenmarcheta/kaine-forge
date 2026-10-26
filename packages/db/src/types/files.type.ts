import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { attachmentEntityTypeEnum, filesTable } from "../schema/files.schema";

export type File = InferSelectModel<typeof filesTable>;
export type NewFile = InferInsertModel<typeof filesTable>;
export type AttachmentEntityType = (typeof attachmentEntityTypeEnum.enumValues)[number];
