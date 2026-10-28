import { Button, MessageSquare } from "@repo/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { AssistantToolActions } from "./assistant-tool-actions";
import { useTranslation } from "../../../hooks/use-translation";
import { STARTER_KEYS } from "../assistant.definition";
import type { ChatMessage } from "../assistant.type";

interface AssistantMessageListProps {
  messages: ChatMessage[];
  onUsePrompt: (prompt: string) => void;
}

export function AssistantMessageList({ messages, onUsePrompt }: AssistantMessageListProps) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const renderedHeight = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // Read the position now, against the height before this render's content: the scroll event
    // that reports a reader leaving the end can arrive after a re-render, such as a keystroke.
    if (
      renderedHeight.current - element.scrollTop - element.clientHeight <=
      element.clientHeight / 4
    )
      element.scrollTop = element.scrollHeight;
    renderedHeight.current = element.scrollHeight;
  }, [messages]);

  return (
    <div className="ui-assistant__transcript">
      <div
        className="ui-assistant__messages"
        ref={viewport}
        onScroll={(event) => {
          const element = event.currentTarget;
          setShowLatest(
            element.scrollHeight - element.scrollTop - element.clientHeight >
              element.clientHeight / 4
          );
        }}
      >
        {messages.length === 0 ? (
          <div className="ui-assistant__welcome">
            <MessageSquare aria-hidden="true" />
            <h2>{t("assistant.welcome")}</h2>
            <p>{t("assistant.emptyState")}</p>
            <div className="ui-assistant__starters">
              {STARTER_KEYS.map((key) => (
                <Button key={key} appearance="subtle" onClick={() => onUsePrompt(t(key))}>
                  {t(key)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="ui-assistant__message-rows" aria-label={t("assistant.messages")}>
            {messages.map((message) => (
              <li key={message.id} className="ui-assistant__message" data-role={message.role}>
                <span className="ui-assistant__speaker">
                  {t(
                    message.role === "assistant" ? "assistant.roleAssistant" : "assistant.roleUser"
                  )}
                </span>
                <div className="ui-assistant__message-content">
                  {message.content ? <p>{message.content}</p> : null}
                  {message.streaming && !message.content ? (
                    <p className="ui-assistant__subtitle">{t("assistant.sending")}</p>
                  ) : null}
                  {message.error ? (
                    <div role="alert" className="ui-assistant__error">
                      <strong>{t(`assistant.ai.${message.error}`)}</strong>
                      {message.error === "failed" ? (
                        <>
                          <p>{t("assistant.ai.uncertain")}</p>
                          <div className="ui-assistant__result-links">
                            <Link to="/todos">{t("assistant.openTodos")}</Link>
                            <Link to="/notes">{t("assistant.openNotes")}</Link>
                          </div>
                        </>
                      ) : null}
                      {message.prompt ? (
                        <>
                          <blockquote>{message.prompt}</blockquote>
                          <Button
                            appearance="subtle"
                            onClick={() => onUsePrompt(message.prompt ?? "")}
                          >
                            {t("assistant.usePrompt")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {message.role === "assistant" && message.toolActions ? (
                    <AssistantToolActions actions={message.toolActions} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showLatest ? (
        <div className="ui-assistant__jump">
          <Button
            appearance="subtle"
            onClick={() => {
              if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
              setShowLatest(false);
            }}
          >
            {t("assistant.jumpLatest")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
