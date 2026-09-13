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
import { useRef, useState } from "react";
import { toast } from "sonner";

import { NEW_CHAT, TEMP_CHAT_PREFIX } from "./assistant.definition";
import { useAssistant } from "./assistant.hook";
import { AssistantComposer } from "./components/assistant-composer";
import { AssistantMessageList } from "./components/assistant-message-list";
import { ConversationList } from "./components/conversation-list";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { LoadingRows } from "../../components/loading-rows";
import { useDeleteConversationMutation } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

export function AssistantRoute() {
  const { activeOrganizationId, isLoading } = useOrganization();
  return (
    <AssistantWorkspace
      key={activeOrganizationId ?? NEW_CHAT}
      organizationId={activeOrganizationId}
      enabled={Boolean(activeOrganizationId) && !isLoading}
    />
  );
}

function AssistantWorkspace({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const assistant = useAssistant(organizationId, enabled);
  const client = useQueryClient();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletion = useDeleteConversationMutation();
  const composer = useRef<HTMLFormElement>(null);
  const conversations = [
    ...assistant.temporaryConversations,
    ...(assistant.conversationsQuery.data?.conversations ?? [])
  ];
  const title =
    conversations.find((item) => item.id === assistant.activeKey)?.title ?? t("assistant.newChat");
  const streaming = assistant.messages.find((message) => message.streaming);
  const status = streaming
    ? t(streaming.content ? "assistant.responding" : "assistant.sending")
    : "";

  function usePrompt(prompt: string) {
    assistant.setDraft(prompt);
    composer.current?.querySelector("textarea")?.focus();
  }

  async function deleteConversation() {
    if (!deletingId || deletingId === assistant.pendingKey) return;
    try {
      if (!deletingId.startsWith(TEMP_CHAT_PREFIX)) await deletion.mutateAsync({ id: deletingId });
      assistant.forget(deletingId);
      setDeletingId(null);
      await client.invalidateQueries({ queryKey: assistant.conversationsKey });
    } catch {
      toast.error(t("error.generic"));
    }
  }

  const history = (
    <ConversationList
      activeId={assistant.activeKey}
      conversations={conversations}
      pendingId={assistant.pendingKey}
      isLoading={assistant.conversationsQuery.isPending}
      isError={assistant.conversationsQuery.isError}
      onRetry={() => void assistant.conversationsQuery.refetch()}
      onDelete={setDeletingId}
      onNew={() => {
        assistant.setActiveKey(NEW_CHAT);
        setIsHistoryOpen(false);
      }}
      onSelect={(id) => {
        assistant.setActiveKey(id);
        setIsHistoryOpen(false);
      }}
    />
  );

  return (
    <section className="ui-assistant">
      <header className="ui-page-header">
        <div>
          <h1>{t("assistant.title")}</h1>
          <p className="ui-assistant__subtitle">{t("assistant.description")}</p>
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
              <SheetDescription>{t("assistant.historyDescription")}</SheetDescription>
            </SheetHeader>
            <div className="ui-assistant__sheet-history">{history}</div>
          </SheetContent>
        </Sheet>
      </header>
      <div className="ui-assistant__body">
        <aside className="ui-assistant__history" aria-label={t("assistant.conversations")}>
          {history}
        </aside>
        <section className="ui-assistant__chat" aria-label={t("assistant.currentChat")}>
          <header className="ui-assistant__chat-header">
            <h2 title={title}>{title}</h2>
            <span role="status" className="ui-assistant__status">
              {status}
            </span>
          </header>
          {assistant.pendingKey && assistant.pendingKey !== assistant.activeKey ? (
            <div className="ui-assistant__pending">
              <span>{t("assistant.replyElsewhere")}</span>
              <Button
                appearance="subtle"
                onClick={() => assistant.setActiveKey(assistant.pendingKey ?? NEW_CHAT)}
              >
                {t("assistant.returnToConversation")}
              </Button>
            </div>
          ) : null}
          {assistant.isHistoryLoading ? (
            <div className="ui-assistant__feedback">
              <LoadingRows label={t("assistant.historyLoading")} />
            </div>
          ) : assistant.isHistoryError && assistant.messages.length === 0 ? (
            <div role="alert" className="ui-assistant__feedback">
              <p>{t("error.generic")}</p>
              <Button appearance="subtle" onClick={() => void assistant.historyQuery.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <AssistantMessageList
              key={assistant.activeKey}
              messages={assistant.messages}
              onUsePrompt={usePrompt}
            />
          )}
          {assistant.isHistoryError && assistant.messages.length > 0 ? (
            <div className="ui-assistant__pending" role="alert">
              <span>{t("assistant.historyFailed")}</span>
              <Button appearance="subtle" onClick={() => void assistant.historyQuery.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : null}
          <AssistantComposer
            formRef={composer}
            value={assistant.draft}
            onChange={assistant.setDraft}
            canSend={assistant.canSend}
            onSubmit={() => void assistant.send()}
          />
        </section>
      </div>
      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        title={t("assistant.deleteChat")}
        message={t("assistant.deleteConfirmMessage")}
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deletion.isPending}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => void deleteConversation()}
      />
    </section>
  );
}
