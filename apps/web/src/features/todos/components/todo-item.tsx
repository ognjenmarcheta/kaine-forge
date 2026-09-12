import {
  Button,
  Checkbox,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@repo/ui";
import { useState } from "react";

import { TodoAttachments } from "./todo-attachments";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoItemProps {
  item: TodoItem;
  onAttachmentChanged: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoItemRow({
  item,
  onAttachmentChanged,
  onDelete,
  onEdit,
  onToggle
}: TodoItemProps) {
  const { t } = useTranslation();
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  return (
    <li className="ui-work-row grid grid-cols-1 items-start gap-[var(--ds-space-150)] md:grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)_auto]">
      <label className="flex items-center gap-[var(--ds-space-100)]">
        <Checkbox
          aria-label={item.title}
          checked={item.completed}
          onCheckedChange={() => {
            onToggle(item);
          }}
        />
        <span
          className={
            item.completed
              ? "text-[color:var(--ds-text-subtle)] line-through"
              : "text-[color:var(--ds-text)]"
          }
        >
          {item.title}
        </span>
      </label>
      <p className="m-0 text-[color:var(--ds-text-subtle)]">
        {item.description || t("common.notAvailable")}
      </p>
      <div className="flex gap-[var(--ds-space-100)]">
        <Button appearance="subtle" spacing="compact" type="button" onClick={() => onEdit(item)}>
          {t("button.edit")}
        </Button>
        <Button
          appearance="danger"
          spacing="compact"
          type="button"
          onClick={() => onDelete(item.id)}
        >
          {t("button.delete")}
        </Button>
      </div>
      <Collapsible
        open={attachmentsOpen}
        onOpenChange={setAttachmentsOpen}
        className="md:col-span-3"
      >
        <CollapsibleTrigger className="ui-disclosure-trigger">
          <ChevronRight aria-hidden className="size-4" />
          {t("todos.attachments.title")}{" "}
          <span className="ml-[var(--ds-space-100)]">{item.attachments.length}</span>
        </CollapsibleTrigger>
        <CollapsibleContent forceMount inert={!attachmentsOpen}>
          <TodoAttachments
            attachments={item.attachments}
            todoId={item.id}
            onChanged={onAttachmentChanged}
          />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
