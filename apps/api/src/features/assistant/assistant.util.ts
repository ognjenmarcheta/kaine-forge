import { ASSISTANT_CONFIG } from "./assistant.config";
import type { MessagesPagination } from "./assistant.type";
import type { PaginationInput } from "../todos/todos.type";

const MAX_CONVERSATION_TITLE_LENGTH = 60;

export function buildConversationTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");

  return normalized.length <= MAX_CONVERSATION_TITLE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 1)}…`;
}

export function coerceMessagesPagination(input: PaginationInput): MessagesPagination {
  const rawLimit = input.limit ?? ASSISTANT_CONFIG.messages.defaultLimit;
  const rawOffset = input.offset ?? 0;

  const limit = Math.min(ASSISTANT_CONFIG.messages.maxLimit, Math.max(1, Math.floor(rawLimit)));
  const offset = Math.max(0, Math.floor(rawOffset));

  return { limit, offset };
}
