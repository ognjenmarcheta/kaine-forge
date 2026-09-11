import { Button } from "@repo/ui";
import { type MouseEvent } from "react";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";

interface ConversationSummary {
  id: string;
  title?: string | null;
  updatedAt: string;
}

interface ConversationListProps {
  activeId: string | null;
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
  conversations,
  isLoading,
  isError,
  onRetry,
  onDelete,
  onNew,
  onSelect
}: ConversationListProps) {
  const { t } = useTranslation();

  function handleDelete(event: MouseEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    onDelete(id);
  }

  return (
    <div className="flex flex-col gap-[var(--ds-space-150)]">
      <Button type="button" onClick={onNew}>
        {t("assistant.newChat")}
      </Button>
      {isLoading ? <LoadingRows label={t("common.loading")} /> : null}
      {isError ? (
        <div role="alert">
          <p>{t("error.generic")}</p>
          <Button appearance="subtle" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-[var(--ds-space-050)]">
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId;
          return (
            <li key={conversation.id} className="flex items-center gap-[var(--ds-space-050)]">
              <Button
                appearance="subtle"
                aria-pressed={isActive}
                className={`min-w-0 flex-1 justify-start truncate text-left ${
                  isActive
                    ? "bg-[var(--ds-background-selected)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-subtle)]"
                }`}
                type="button"
                onClick={() => onSelect(conversation.id)}
              >
                {conversation.title ?? t("assistant.untitled")}
              </Button>
              <Button
                appearance="subtle"
                type="button"
                onClick={(event) => handleDelete(event, conversation.id)}
              >
                {t("assistant.deleteChat")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
