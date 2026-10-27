import type { AssistantConversation, AssistantMessage } from "@repo/db";
import { assistantConversationsTable, assistantMessagesTable } from "@repo/db/schema";
import { desc, eq } from "drizzle-orm";

import { ASSISTANT_CONFIG } from "./assistant.config";
import type { AssistantToolAction } from "./assistant.type";
import type { Connection, PageInput, ScopedData } from "../../context.data";

export async function createConversation(
  data: ScopedData,
  input: { title?: string | null } = {}
): Promise<AssistantConversation> {
  const conversations = await data
    .insert(assistantConversationsTable)
    .values({ ...data.stamp("userId"), title: input.title ?? null })
    .returning();

  const conversation = conversations[0];

  if (!conversation) {
    throw new Error("failed to create conversation");
  }

  return conversation;
}

export async function getConversationById(
  data: ScopedData,
  id: string
): Promise<AssistantConversation | null> {
  const conversations = await data
    .selectFrom(
      assistantConversationsTable,
      eq(assistantConversationsTable.id, id),
      data.mine(assistantConversationsTable)
    )
    .limit(1);

  return conversations[0] ?? null;
}

export async function listMessages(
  data: ScopedData,
  conversationId: string,
  page: PageInput
): Promise<Connection<AssistantMessage>> {
  return data.page(
    assistantMessagesTable,
    page,
    {
      orderBy: assistantMessagesTable.createdAt,
      direction: "asc",
      limits: ASSISTANT_CONFIG.messages
    },
    eq(assistantMessagesTable.conversationId, conversationId)
  );
}

export async function listRecentMessages(
  data: ScopedData,
  conversationId: string,
  limit: number
): Promise<AssistantMessage[]> {
  const messages = await data
    .selectFrom(assistantMessagesTable, eq(assistantMessagesTable.conversationId, conversationId))
    .orderBy(desc(assistantMessagesTable.createdAt))
    .limit(limit);

  return messages.reverse();
}

export async function appendMessage(
  data: ScopedData,
  input: {
    content: string;
    conversationId: string;
    role: "assistant" | "user";
    toolActions?: AssistantToolAction[] | null;
  }
): Promise<AssistantMessage> {
  const messages = await data
    .insert(assistantMessagesTable)
    .values({
      ...data.stamp(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolActions: input.toolActions ?? null
    })
    .returning();

  const message = messages[0];

  if (!message) {
    throw new Error("failed to append message");
  }

  return message;
}

export async function touchConversation(data: ScopedData, id: string): Promise<void> {
  await data.update(
    assistantConversationsTable,
    { updatedAt: new Date() },
    eq(assistantConversationsTable.id, id)
  );
}

export async function listConversations(
  data: ScopedData,
  page: PageInput
): Promise<Connection<AssistantConversation>> {
  return data.page(
    assistantConversationsTable,
    page,
    {
      orderBy: assistantConversationsTable.updatedAt,
      direction: "desc",
      limits: ASSISTANT_CONFIG.messages
    },
    data.mine(assistantConversationsTable)
  );
}

export async function deleteConversation(data: ScopedData, id: string): Promise<boolean> {
  const rows = await data
    .delete(
      assistantConversationsTable,
      eq(assistantConversationsTable.id, id),
      data.mine(assistantConversationsTable)
    )
    .returning({ id: assistantConversationsTable.id });
  return rows.length > 0;
}
