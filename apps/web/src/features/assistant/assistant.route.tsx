import { createTodoListQueryKey } from "@repo/todos";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import type { AssistantMessageDeltaData, ChatMessage } from "./assistant.type";
import { AssistantComposer } from "./components/assistant-composer";
import { AssistantMessageList } from "./components/assistant-message-list";
import { useGetTodosQuery, useSendMessageMutation } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
import { useTranslation } from "../../hooks/use-translation";
import { TODOS_CONFIG } from "../todos/todos.config";

export function AssistantRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const streamingIdRef = useRef<string | null>(null);

  const sendMessageMutation = useSendMessageMutation();

  const listVariables = useMemo(
    () => ({
      limit: TODOS_CONFIG.pageSize,
      offset: 0
    }),
    []
  );
  const todosQueryKey = useMemo(
    () =>
      createTodoListQueryKey({
        activeOrganizationId,
        queryKey: useGetTodosQuery.getKey(listVariables)
      }),
    [activeOrganizationId, listVariables]
  );

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  const todosQuery = useGetTodosQuery(listVariables, {
    enabled: subscriptionEnabled,
    queryKey: todosQueryKey
  });

  useSubscription({
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey],
    query: "subscription { todoCreated { id } }"
  });
  useSubscription({
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey],
    query: "subscription { todoUpdated { id } }"
  });
  useSubscription({
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey],
    query: "subscription { todoDeleted { id } }"
  });
  useSubscription({
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey],
    query: "subscription { todoToggled { id } }"
  });

  const handleDelta = useCallback((data: AssistantMessageDeltaData) => {
    const pid = streamingIdRef.current;
    const delta = data.assistantMessageDelta.delta;

    if (!pid || delta.length === 0) {
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === pid ? { ...message, content: message.content + delta } : message
      )
    );
  }, []);

  useSubscription<AssistantMessageDeltaData>({
    enabled: subscriptionEnabled,
    onData: handleDelta,
    query: "subscription { assistantMessageDelta { conversationId delta } }"
  });

  const todos = useMemo(() => todosQuery.data?.todos ?? [], [todosQuery.data]);
  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const todoSummary = `${completedCount.toString()}/${todos.length.toString()}`;

  function dropStreamingMessage() {
    const pid = streamingIdRef.current;
    streamingIdRef.current = null;

    if (pid) {
      setMessages((current) => current.filter((message) => message.id !== pid));
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();

    if (message.length === 0) {
      return;
    }

    const placeholderId = crypto.randomUUID();
    streamingIdRef.current = placeholderId;
    setMessages((current) => [
      ...current,
      { content: message, id: crypto.randomUUID(), role: "user" },
      { content: "", id: placeholderId, role: "assistant", streaming: true }
    ]);
    setInput("");

    try {
      const result = await sendMessageMutation.mutateAsync({
        input: {
          message,
          ...(conversationId ? { conversationId } : {})
        }
      });

      const payload = result.sendMessage;

      if (payload.status === "REPLIED" && payload.reply) {
        streamingIdRef.current = null;
        setConversationId(payload.conversationId);
        setMessages((current) =>
          current.map((current_message) =>
            current_message.id === placeholderId
              ? {
                  ...current_message,
                  content: payload.reply ?? current_message.content,
                  streaming: false,
                  toolCount: payload.toolActions.length
                }
              : current_message
          )
        );
        return;
      }

      dropStreamingMessage();
      toast.error(
        payload.status === "AI_NOT_CONFIGURED"
          ? t("assistant.ai.notConfigured")
          : t("assistant.ai.failed")
      );
    } catch {
      dropStreamingMessage();
      toast.error(t("assistant.ai.failed"));
    }
  }

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header>
        <h1>{t("assistant.title")}</h1>
        <p className="m-0 text-[color:var(--ds-text-subtle)]">{t("assistant.description")}</p>
      </header>

      <section className="flex flex-col gap-[var(--ds-space-150)] rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-200)]">
        <div className="flex items-center justify-between gap-[var(--ds-space-150)]">
          <h2 className="m-0">{t("assistant.todosTitle")}</h2>
          <span className="text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
            {todoSummary}
          </span>
        </div>
        {todos.length === 0 ? (
          <p className="m-0 text-[color:var(--ds-text-subtle)]">{t("assistant.todosEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-[var(--ds-space-050)]">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className={
                  todo.completed ? "text-[color:var(--ds-text-subtle)] line-through" : undefined
                }
              >
                {todo.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-[var(--ds-space-200)] rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-200)]">
        <AssistantMessageList
          assistantLabel={t("assistant.roleAssistant")}
          emptyState={t("assistant.emptyState")}
          messages={messages}
          toolActionsLabel={t("assistant.toolActions")}
          userLabel={t("assistant.roleUser")}
        />
        <AssistantComposer
          inputLabel={t("assistant.inputLabel")}
          isPending={sendMessageMutation.status === "pending"}
          placeholder={t("assistant.placeholder")}
          sendLabel={t("assistant.send")}
          sendingLabel={t("assistant.sending")}
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
        />
      </section>
    </section>
  );
}
