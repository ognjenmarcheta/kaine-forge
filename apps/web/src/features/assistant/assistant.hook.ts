import { createActiveOrganizationQueryKey } from "@repo/query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  CONVERSATIONS_VARIABLES,
  CONVERSATION_TITLE_LENGTH,
  NEW_CHAT,
  TEMP_CHAT_PREFIX
} from "./assistant.definition";
import type { AssistantMessageDeltaData, ChatMessage } from "./assistant.type";
import {
  GetConversationDocument,
  type GetConversationQuery,
  type GetConversationQueryVariables,
  useGetConversationQuery,
  useGetConversationsQuery,
  useSendMessageMutation
} from "../../graphql/generated/react-query";
import { useSubscription } from "../../hooks/use-subscription";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation(
  "assistant.web.conversations",
  useGetConversationsQuery.getKey()
);

interface PendingReply {
  key: string;
  conversationId: string | null;
  messageId: string;
}

export function useAssistant(organizationId: string | null, enabled: boolean) {
  const client = useQueryClient();
  const [activeKey, setActiveKey] = useState(NEW_CHAT);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [exchanges, setExchanges] = useState<Record<string, ChatMessage[]>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [temporaryConversations, setTemporaryConversations] = useState<
    { id: string; title: string; updatedAt: string }[]
  >([]);
  const pending = useRef<PendingReply | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current = null;
    };
  }, []);

  const mutation = useSendMessageMutation();
  const fetchHistory = useGraphqlFetcher<GetConversationQuery, GetConversationQueryVariables>(
    GetConversationDocument
  );
  const conversationsKey = createActiveOrganizationQueryKey(
    useGetConversationsQuery.getKey(CONVERSATIONS_VARIABLES),
    organizationId
  );
  const conversationsQuery = useGetConversationsQuery(CONVERSATIONS_VARIABLES, {
    enabled,
    queryKey: conversationsKey
  });
  function historyKey(id: string) {
    return createActiveOrganizationQueryKey(
      useGetConversationQuery.getKey({ conversationId: id, limit: 100 }),
      organizationId
    );
  }
  const isSaved = activeKey !== NEW_CHAT && !activeKey.startsWith(TEMP_CHAT_PREFIX);
  const historyQuery = useGetConversationQuery(
    { conversationId: activeKey, limit: 100 },
    {
      enabled: enabled && isSaved && pendingKey !== activeKey,
      queryKey: historyKey(activeKey)
    }
  );

  const handleDelta = useCallback((data: AssistantMessageDeltaData) => {
    const request = pending.current;
    const { conversationId, delta } = data.assistantMessageDelta;
    if (!request || !delta || (request.conversationId && request.conversationId !== conversationId))
      return;
    // The first delta gives a new chat its server identity. Later deltas must match it.
    request.conversationId = conversationId;
    setExchanges((current) => ({
      ...current,
      [request.key]: (current[request.key] ?? []).map((message) =>
        message.id === request.messageId
          ? { ...message, content: message.content + delta }
          : message
      )
    }));
  }, []);
  useSubscription<AssistantMessageDeltaData>({
    enabled,
    onData: handleDelta,
    query: "subscription { assistantMessageDelta { conversationId delta } }"
  });

  const messages: ChatMessage[] = [
    ...(isSaved
      ? (historyQuery.data?.assistantMessages ?? []).map((row): ChatMessage => ({
          id: row.id,
          content: row.content,
          role: row.role === "assistant" ? "assistant" : "user",
          toolActions: row.toolActions.map((action) => ({
            tool: action.tool,
            output: action.output ?? null
          }))
        }))
      : []),
    ...(exchanges[activeKey] ?? [])
  ];

  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [activeKey]: value }));
  }

  async function send() {
    const prompt = (drafts[activeKey] ?? "").trim();
    if (
      !enabled ||
      pending.current ||
      !prompt ||
      (isSaved && (!historyQuery.data || historyQuery.isError))
    )
      return;
    const key = activeKey === NEW_CHAT ? `${TEMP_CHAT_PREFIX}${crypto.randomUUID()}` : activeKey;
    if (activeKey === NEW_CHAT) {
      setTemporaryConversations((current) => [
        {
          id: key,
          title: prompt.replace(/\s+/g, " ").slice(0, CONVERSATION_TITLE_LENGTH),
          updatedAt: new Date().toISOString()
        },
        ...current
      ]);
    }
    const messageId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const request: PendingReply = { key, conversationId: isSaved ? activeKey : null, messageId };
    pending.current = request;
    setPendingKey(key);
    setActiveKey(key);
    setDrafts((current) => ({ ...current, [activeKey]: "", [key]: "" }));
    setExchanges((current) => ({
      ...current,
      [key]: [
        ...(current[key] ?? []),
        { id: userMessageId, role: "user", content: prompt },
        { id: messageId, role: "assistant", content: "", streaming: true }
      ]
    }));

    let targetKey = key;
    let replied = false;
    let confirmedMessages: GetConversationQuery["assistantMessages"] = [];
    try {
      const result = await mutation.mutateAsync({
        input: {
          message: prompt,
          ...(isSaved ? { conversationId: activeKey } : {})
        }
      });
      if (!mounted.current || pending.current !== request) return;
      const payload = result.sendMessage;
      if (payload.conversationId) targetKey = payload.conversationId;
      replied = payload.status === "REPLIED" && payload.reply != null;
      if (replied) {
        const createdAt = new Date().toISOString();
        confirmedMessages = [
          {
            id: userMessageId,
            conversationId: targetKey,
            role: "user",
            content: prompt,
            createdAt,
            toolActions: []
          },
          {
            id: messageId,
            conversationId: targetKey,
            role: "assistant",
            content: payload.reply ?? "",
            createdAt,
            toolActions: payload.toolActions
          }
        ];
      }
      setExchanges((current) => ({
        ...current,
        [key]: (current[key] ?? []).flatMap((message): ChatMessage[] => {
          if (!replied && message.id === userMessageId) return [];
          if (message.id !== messageId) return [message];
          return [
            replied
              ? {
                  ...message,
                  content: payload.reply ?? "",
                  streaming: false,
                  toolActions: payload.toolActions.map((action) => ({
                    tool: action.tool,
                    output: action.output ?? null
                  }))
                }
              : {
                  ...message,
                  streaming: false,
                  prompt,
                  error: payload.status === "AI_NOT_CONFIGURED" ? "notConfigured" : "failed"
                }
          ];
        })
      }));
    } catch {
      if (!mounted.current || pending.current !== request) return;
      targetKey = request.conversationId ?? key;
      setExchanges((current) => ({
        ...current,
        [key]: (current[key] ?? [])
          .filter((message) => message.id !== userMessageId)
          .map((message) =>
            message.id === messageId
              ? { ...message, streaming: false, error: "failed", prompt }
              : message
          )
      }));
    }

    if (!mounted.current || pending.current !== request) return;
    if (targetKey !== NEW_CHAT && !targetKey.startsWith(TEMP_CHAT_PREFIX)) {
      try {
        await client.fetchQuery({
          queryKey: historyKey(targetKey),
          queryFn: () => fetchHistory({ conversationId: targetKey, limit: 100 }),
          staleTime: 0
        });
      } catch {
        // The mutation confirmed these messages even if the follow-up read fails.
        if (mounted.current && pending.current === request && replied) {
          client.setQueryData<GetConversationQuery>(historyKey(targetKey), (current) => ({
            assistantMessages: [...(current?.assistantMessages ?? []), ...confirmedMessages]
          }));
        }
      }
    }
    if (!mounted.current || pending.current !== request) return;
    setExchanges((current) => {
      const next = { ...current };
      next[targetKey] = (current[key] ?? []).filter(
        (message) => !replied || (message.id !== messageId && message.id !== userMessageId)
      );
      if (targetKey !== key) delete next[key];
      return next;
    });
    if (targetKey !== key) {
      setTemporaryConversations((current) =>
        current.filter((conversation) => conversation.id !== key)
      );
      setDrafts((current) => {
        const next = { ...current, [targetKey]: current[key] ?? "" };
        delete next[key];
        return next;
      });
      setActiveKey((current) => (current === key ? targetKey : current));
    }
    pending.current = null;
    setPendingKey(null);
    void client.invalidateQueries({ queryKey: conversationsKey });
  }

  function forget(id: string) {
    setTemporaryConversations((current) =>
      current.filter((conversation) => conversation.id !== id)
    );
    client.removeQueries({ queryKey: historyKey(id) });
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setExchanges((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setActiveKey((current) => (current === id ? NEW_CHAT : current));
  }

  return {
    activeKey,
    setActiveKey,
    draft: drafts[activeKey] ?? "",
    setDraft,
    messages,
    pendingKey,
    send,
    forget,
    conversationsQuery,
    temporaryConversations,
    conversationsKey,
    historyQuery,
    isHistoryLoading: isSaved && !historyQuery.data && historyQuery.isPending,
    isHistoryError: isSaved && historyQuery.isError,
    canSend:
      enabled && !pendingKey && (!isSaved || (Boolean(historyQuery.data) && !historyQuery.isError))
  };
}
