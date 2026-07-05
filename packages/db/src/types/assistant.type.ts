import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { assistantConversationsTable, assistantMessagesTable } from "../schema/assistant.schema";

export type AssistantConversation = InferSelectModel<typeof assistantConversationsTable>;
export type NewAssistantConversation = InferInsertModel<typeof assistantConversationsTable>;

export type AssistantMessage = InferSelectModel<typeof assistantMessagesTable>;
export type NewAssistantMessage = InferInsertModel<typeof assistantMessagesTable>;
