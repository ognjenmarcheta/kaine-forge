const MAX_CONVERSATION_TITLE_LENGTH = 60;

export function buildConversationTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");

  return normalized.length <= MAX_CONVERSATION_TITLE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 1)}…`;
}
