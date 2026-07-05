import { Button } from "@repo/ui";
import { type MouseEvent } from "react";

import { useTranslation } from "../../../hooks/use-translation";

interface ConversationSummary {
  id: string;
  title?: string | null;
  updatedAt: string;
}

interface ConversationListProps {
  activeId: string | null;
  conversations: ConversationSummary[];
  onDelete: (id: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}

export function ConversationList({
  activeId,
  conversations,
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
      <ul className="flex flex-col gap-[var(--ds-space-050)]">
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId;
          return (
            <li key={conversation.id} className="flex items-center gap-[var(--ds-space-050)]">
              <Button
                appearance="subtle"
                className={`flex-1 justify-start truncate text-left ${
                  isActive
                    ? "bg-[var(--ds-surface-hovered)] text-[color:var(--ds-text)]"
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
