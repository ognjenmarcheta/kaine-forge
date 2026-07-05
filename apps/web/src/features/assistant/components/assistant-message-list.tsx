import type { ChatMessage } from "../assistant.type";

interface AssistantMessageListProps {
  assistantLabel: string;
  emptyState: string;
  messages: ChatMessage[];
  toolActionsLabel: string;
  userLabel: string;
}

export function AssistantMessageList({
  assistantLabel,
  emptyState,
  messages,
  toolActionsLabel,
  userLabel
}: AssistantMessageListProps) {
  if (messages.length === 0) {
    return <p className="text-[color:var(--ds-text-subtle)]">{emptyState}</p>;
  }

  return (
    <ul className="flex flex-col gap-[var(--ds-space-150)]">
      {messages.map((message) => {
        const roleLabel = message.role === "assistant" ? assistantLabel : userLabel;
        const toolSummary = message.toolCount
          ? `${toolActionsLabel}: ${message.toolCount.toString()}`
          : null;

        return (
          <li
            key={message.id}
            className="flex flex-col gap-[var(--ds-space-050)] rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-150)]"
          >
            <span className="text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
              {roleLabel}
            </span>
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
            {toolSummary ? (
              <span className="text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
                {toolSummary}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
