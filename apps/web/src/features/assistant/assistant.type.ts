export interface ChatMessage {
  content: string;
  id: string;
  role: "assistant" | "user";
  streaming?: boolean;
  toolCount?: number;
}

export interface AssistantMessageDeltaData {
  assistantMessageDelta: {
    conversationId: string;
    delta: string;
  };
}
