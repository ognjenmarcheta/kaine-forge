export interface ChatMessage {
  content: string;
  id: string;
  role: "assistant" | "user";
  streaming?: boolean;
  toolCount?: number;
  toolActions?: { output: string | null; tool: string }[];
}

export interface AssistantMessageDeltaData {
  assistantMessageDelta: {
    conversationId: string;
    delta: string;
  };
}
