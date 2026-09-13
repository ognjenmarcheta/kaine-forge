import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Ellipsis
} from "@repo/ui";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";

interface ConversationSummary {
  id: string;
  title?: string | null;
  updatedAt: string;
}
interface ConversationListProps {
  activeId: string;
  pendingId: string | null;
  conversations: ConversationSummary[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}

export function ConversationList({
  activeId,
  pendingId,
  conversations,
  isLoading,
  isError,
  onRetry,
  onDelete,
  onNew,
  onSelect
}: ConversationListProps) {
  const { t, language } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(language, { month: "short", day: "numeric" });
  return (
    <div className="ui-assistant__conversation-list">
      <div className="ui-assistant__history-heading">
        <h2>{t("assistant.conversations")}</h2>
        <Button type="button" onClick={onNew}>
          {t("assistant.newChat")}
        </Button>
      </div>
      <div className="ui-assistant__conversation-scroll">
        {isLoading ? <LoadingRows label={t("common.loading")} /> : null}
        {isError ? (
          <div role="alert">
            <p>{t("error.generic")}</p>
            <Button appearance="subtle" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {!isLoading && !isError && conversations.length === 0 ? (
          <p className="ui-assistant__subtitle">{t("assistant.noConversations")}</p>
        ) : null}
        <ul className="ui-assistant__conversation-rows">
          {conversations.map((conversation) => {
            const title = conversation.title ?? t("assistant.untitled");
            const date = new Date(conversation.updatedAt);
            return (
              <li
                key={conversation.id}
                className="ui-assistant__conversation-row"
                data-active={conversation.id === activeId}
              >
                <Button
                  appearance="subtle"
                  aria-pressed={conversation.id === activeId}
                  className="ui-assistant__conversation-select"
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                >
                  <span className="ui-assistant__conversation-title" title={title}>
                    {title}
                  </span>
                  <span className="ui-assistant__conversation-date">
                    {conversation.id === pendingId ? (
                      t("assistant.responding")
                    ) : Number.isNaN(date.getTime()) ? null : (
                      <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
                    )}
                  </span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      appearance="subtle"
                      aria-label={`${t("assistant.conversationMenu")}: ${title}`}
                    >
                      <Ellipsis aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      destructive
                      disabled={conversation.id === pendingId}
                      onSelect={() => onDelete(conversation.id)}
                    >
                      {t("assistant.deleteChat")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
