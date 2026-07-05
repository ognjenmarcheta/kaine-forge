import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  assistantConversationsTable,
  assistantMessagesTable,
  db,
  type AssistantConversation,
  type AssistantMessage
} from "@repo/db";
import { and, asc, eq } from "drizzle-orm";

import type { AssistantToolAction, MessagesPagination } from "./assistant.type";

export async function createConversation(
  scope: AuthenticatedOrganizationScope,
  input: { title?: string | null } = {}
): Promise<AssistantConversation> {
  const conversations = await db
    .insert(assistantConversationsTable)
    .values({
      userId: scope.userId,
      organizationId: scope.organizationId,
      title: input.title ?? null
    })
    .returning();

  const conversation = conversations[0];

  if (!conversation) {
    throw new Error("failed to create conversation");
  }

  return conversation;
}

export async function getConversationById(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<AssistantConversation | null> {
  const conversations = await db
    .select()
    .from(assistantConversationsTable)
    .where(
      and(
        eq(assistantConversationsTable.id, id),
        eq(assistantConversationsTable.organizationId, scope.organizationId)
      )
    )
    .limit(1);

  return conversations[0] ?? null;
}

export async function listMessages(
  scope: AuthenticatedOrganizationScope,
  conversationId: string,
  pagination: MessagesPagination
): Promise<AssistantMessage[]> {
  return db
    .select()
    .from(assistantMessagesTable)
    .where(
      and(
        eq(assistantMessagesTable.conversationId, conversationId),
        eq(assistantMessagesTable.organizationId, scope.organizationId)
      )
    )
    .orderBy(asc(assistantMessagesTable.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function appendMessage(
  scope: AuthenticatedOrganizationScope,
  input: {
    content: string;
    conversationId: string;
    role: "assistant" | "user";
    toolActions?: AssistantToolAction[] | null;
  }
): Promise<AssistantMessage> {
  const messages = await db
    .insert(assistantMessagesTable)
    .values({
      conversationId: input.conversationId,
      organizationId: scope.organizationId,
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

export async function touchConversation(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<void> {
  await db
    .update(assistantConversationsTable)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(assistantConversationsTable.id, id),
        eq(assistantConversationsTable.organizationId, scope.organizationId)
      )
    );
}
