export type SendMessageStatus = "AI_NOT_CONFIGURED" | "FAILED" | "REPLIED";

export interface SendMessageInput {
  conversationId?: string | null;
  message: string;
}

export interface AssistantToolAction {
  input: unknown;
  output: unknown;
  tool: string;
}

export interface ConversationMessage {
  content: string;
  role: "assistant" | "user";
}

export interface SendMessagePayload {
  conversationId: string;
  message?: string | null;
  reply: string | null;
  status: SendMessageStatus;
  toolActions: AssistantToolAction[];
}

export interface MessagesPagination {
  limit: number;
  offset: number;
}
