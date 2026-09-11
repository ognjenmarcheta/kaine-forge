import { useEffect, useRef } from "react";

import { AssistantToolActions } from "./assistant-tool-actions";
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
  const viewport = useRef<HTMLDivElement>(null);
  const followsLatest = useRef(true);
  useEffect(() => {
    if (viewport.current && followsLatest.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [messages]);
  if (messages.length === 0) {
    return <p className="ui-empty-state flex-1">{emptyState}</p>;
  }

  return (
    <div
      className="ui-assistant__messages"
      ref={viewport}
      onScroll={(event) => {
        const element = event.currentTarget;
        followsLatest.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <=
          element.clientHeight / 4;
      }}
    >
      <ul className="ui-work-list">
        {messages.map((message) => {
          const roleLabel = message.role === "assistant" ? assistantLabel : userLabel;
          const toolSummary = message.toolCount
            ? `${toolActionsLabel}: ${message.toolCount.toString()}`
            : null;

          return (
            <li key={message.id} className="ui-work-row flex flex-col gap-[var(--ds-space-100)]">
              <span className="text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
                {roleLabel}
              </span>
              <p className="m-0 whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && message.toolActions ? (
                <AssistantToolActions actions={message.toolActions} />
              ) : null}
              {toolSummary ? (
                <span className="text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
                  {toolSummary}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
