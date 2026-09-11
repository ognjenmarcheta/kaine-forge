import { createActiveOrganizationQueryKey } from "@repo/query";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import type { AssistantMessageDeltaData, ChatMessage } from "./assistant.type";
import { AssistantComposer } from "./components/assistant-composer";
import { AssistantMessageList } from "./components/assistant-message-list";
import { ConversationList } from "./components/conversation-list";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { LoadingRows } from "../../components/loading-rows";
import {
  useDeleteConversationMutation,
  useGetConversationQuery,
  useGetConversationsQuery,
  useSendMessageMutation
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
import { useTranslation } from "../../hooks/use-translation";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation(
  "assistant.web.conversations",
  useGetConversationsQuery.getKey()
);

export function AssistantRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const populatedRef = useRef<string | null>(null);

  const sendMessageMutation = useSendMessageMutation();
  const deleteConversationMutation = useDeleteConversationMutation();

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  const conversationsVariables = useMemo(() => ({ limit: 50, offset: 0 }), []);
  const conversationsQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGetConversationsQuery.getKey(conversationsVariables),
        activeOrganizationId
      ),
    [activeOrganizationId, conversationsVariables]
  );
  const conversationsQuery = useGetConversationsQuery(conversationsVariables, {
    enabled: subscriptionEnabled,
    queryKey: conversationsQueryKey
  });
  const conversations = conversationsQuery.data?.conversations ?? [];

  const historyVariables = useMemo(
    () => ({ conversationId: activeConversationId ?? "", limit: 100 }),
    [activeConversationId]
  );
  const historyQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGetConversationQuery.getKey(historyVariables),
        activeOrganizationId
      ),
    [activeOrganizationId, historyVariables]
  );
  const historyQuery = useGetConversationQuery(historyVariables, {
    enabled: Boolean(activeConversationId) && subscriptionEnabled,
    queryKey: historyQueryKey
  });

  useEffect(() => {
    if (!activeConversationId) return;
    if (populatedRef.current === activeConversationId) return;
    const rows = historyQuery.data?.assistantMessages;
    if (!rows) return;
    populatedRef.current = activeConversationId;
    setMessages(
      rows.map((row): ChatMessage => {
        const role = row.role === "assistant" ? "assistant" : "user";
        if (role === "assistant") {
          return {
            content: row.content,
            id: row.id,
            role,
            toolActions: row.toolActions.map((action) => ({
              output: action.output ?? null,
              tool: action.tool
            }))
          };
        }
        return { content: row.content, id: row.id, role };
      })
    );
  }, [activeConversationId, historyQuery.data]);

  const handleDelta = useCallback((data: AssistantMessageDeltaData) => {
    const pid = streamingIdRef.current;
    const delta = data.assistantMessageDelta.delta;

    if (!pid || delta.length === 0) {
      return;
    }

    // Ignore deltas from a different conversation (e.g. a still-streaming send
    // the user navigated away from). A null ref means a brand-new chat whose
    // conversation id isn't known until the reply returns — accept those.
    const streamConversationId = streamingConversationIdRef.current;
    if (
      streamConversationId !== null &&
      data.assistantMessageDelta.conversationId !== streamConversationId
    ) {
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

  function dropStreamingMessage() {
    const pid = streamingIdRef.current;
    streamingIdRef.current = null;

    if (pid) {
      setMessages((current) => current.filter((message) => message.id !== pid));
    }
  }

  function startNewChat() {
    populatedRef.current = "new";
    setActiveConversationId(null);
    setMessages([]);
  }

  function openConversation(id: string) {
    if (id === activeConversationId) return;
    populatedRef.current = null;
    setMessages([]);
    setActiveConversationId(id);
  }

  async function handleDeleteConversation(id: string) {
    try {
      await deleteConversationMutation.mutateAsync({ id });
      setDeletingConversationId(null);
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      if (id === activeConversationId) {
        startNewChat();
      }
    } catch {
      toast.error(t("error.generic"));
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
    streamingConversationIdRef.current = activeConversationId;
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
          ...(activeConversationId ? { conversationId: activeConversationId } : {})
        }
      });

      const payload = result.sendMessage;

      if (payload.status === "REPLIED" && payload.reply) {
        streamingIdRef.current = null;
        const toolActions = payload.toolActions.map((action) => ({
          output: action.output ?? null,
          tool: action.tool
        }));
        setMessages((current) =>
          current.map((current_message) =>
            current_message.id === placeholderId
              ? {
                  ...current_message,
                  content: payload.reply ?? current_message.content,
                  streaming: false,
                  toolActions,
                  toolCount: payload.toolActions.length
                }
              : current_message
          )
        );

        if (!activeConversationId) {
          populatedRef.current = payload.conversationId;
          setActiveConversationId(payload.conversationId);
        }
        await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
        return;
      }

      dropStreamingMessage();
      setInput((current) => current || message);
      toast.error(
        payload.status === "AI_NOT_CONFIGURED"
          ? t("assistant.ai.notConfigured")
          : t("assistant.ai.failed")
      );
    } catch {
      dropStreamingMessage();
      setInput((current) => current || message);
      toast.error(t("assistant.ai.failed"));
    }
  }

  const isHistoryLoading =
    Boolean(activeConversationId) && historyQuery.status === "pending" && messages.length === 0;

  return (
    <section className="ui-assistant">
      <header className="ui-page-header">
        <div>
          <h1>{t("assistant.title")}</h1>
          <p className="m-0 text-[color:var(--ds-text-subtle)]">{t("assistant.description")}</p>
        </div>
        <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <SheetTrigger asChild>
            <Button appearance="subtle" className="ui-assistant__history-trigger">
              {t("assistant.conversations")}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" closeLabel={t("common.close")}>
            <SheetHeader>
              <SheetTitle>{t("assistant.conversations")}</SheetTitle>
              <SheetDescription>{t("assistant.description")}</SheetDescription>
            </SheetHeader>
            <div className="overflow-auto p-[var(--ds-space-200)]">
              <ConversationList
                activeId={activeConversationId}
                conversations={conversations}
                isLoading={conversationsQuery.isPending}
                isError={conversationsQuery.isError}
                onRetry={() => void conversationsQuery.refetch()}
                onDelete={setDeletingConversationId}
                onNew={() => {
                  startNewChat();
                  setIsHistoryOpen(false);
                }}
                onSelect={(id) => {
                  openConversation(id);
                  setIsHistoryOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="ui-assistant__body">
        <aside className="ui-assistant__history">
          <ConversationList
            activeId={activeConversationId}
            conversations={conversations}
            isLoading={conversationsQuery.isPending}
            isError={conversationsQuery.isError}
            onRetry={() => void conversationsQuery.refetch()}
            onDelete={setDeletingConversationId}
            onNew={startNewChat}
            onSelect={openConversation}
          />
        </aside>

        <section className="ui-assistant__chat">
          {isHistoryLoading ? (
            <div className="flex-1">
              <LoadingRows label={t("assistant.historyLoading")} />
            </div>
          ) : activeConversationId && historyQuery.isError ? (
            <div role="alert" className="flex-1">
              <p>{t("error.generic")}</p>
              <Button appearance="subtle" onClick={() => void historyQuery.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <AssistantMessageList
              assistantLabel={t("assistant.roleAssistant")}
              emptyState={t("assistant.emptyState")}
              messages={messages}
              toolActionsLabel={t("assistant.toolActions")}
              userLabel={t("assistant.roleUser")}
            />
          )}
          <AssistantComposer
            inputLabel={t("assistant.inputLabel")}
            isPending={sendMessageMutation.status === "pending"}
            placeholder={t("assistant.placeholder")}
            sendLabel={t("assistant.send")}
            sendingLabel={t("assistant.sending")}
            value={input}
            onChange={setInput}
            onSubmit={(event) => void handleSend(event)}
          />
        </section>
      </div>
      <ConfirmDialog
        isOpen={Boolean(deletingConversationId)}
        title={t("assistant.deleteChat")}
        message={t("assistant.deleteConfirmMessage")}
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deleteConversationMutation.isPending}
        onCancel={() => setDeletingConversationId(null)}
        onConfirm={() => {
          if (deletingConversationId) void handleDeleteConversation(deletingConversationId);
        }}
      />
    </section>
  );
}
