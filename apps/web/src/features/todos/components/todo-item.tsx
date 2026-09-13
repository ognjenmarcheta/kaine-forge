import {
  Button,
  Checkbox,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Ellipsis
} from "@repo/ui";
import { useRef, useState } from "react";

import { TodoAttachments } from "./todo-attachments";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

export interface TodoItemProps {
  item: TodoItem;
  busy: boolean;
  uploadBusy: boolean;
  error?: string | undefined;
  onEdit: (item: TodoItem) => void;
  onDelete: (id: string) => void;
  onToggle: (item: TodoItem) => void;
  onUpload: (file: File, item: TodoItem) => void;
  onDeleteAttachment: (todoId: string, fileId: string) => void;
  onRefresh: () => void;
}
export function TodoItemRow({
  item,
  busy,
  uploadBusy,
  error,
  onEdit,
  onDelete,
  onToggle,
  onUpload,
  onDeleteAttachment,
  onRefresh
}: TodoItemProps) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = useRef<"edit" | "delete" | null>(null);
  return (
    <li className="ui-work-row ui-todos__row" data-todo-id={item.id}>
      <div className="ui-todos__row-main">
        <label className="ui-todos__check" htmlFor={`todo-check-${item.id}`}>
          <Checkbox
            id={`todo-check-${item.id}`}
            aria-label={item.title}
            checked={item.completed}
            disabled={busy}
            onCheckedChange={() => onToggle(item)}
          />
        </label>
        <div className="ui-todos__text">
          <Button
            appearance="link"
            type="button"
            className="ui-todos__title"
            data-completed={item.completed}
            disabled={busy}
            onClick={() => onEdit(item)}
          >
            {item.title}
          </Button>
          {item.description ? <p className="ui-todos__preview">{item.description}</p> : null}
          <small>
            {t("todos.updated").replace(
              "{date}",
              new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
                new Date(item.updatedAt)
              )
            )}
          </small>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              appearance="ghost"
              disabled={busy}
              aria-label={t("todos.rowActions").replace("{title}", item.title)}
            >
              <Ellipsis aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={() => {
              const action = selected.current;
              selected.current = null;
              if (action)
                requestAnimationFrame(() => {
                  if (action === "edit") onEdit(item);
                  else onDelete(item.id);
                });
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                selected.current = "edit";
              }}
            >
              {t("button.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                selected.current = "delete";
              }}
            >
              {t("button.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {busy ? <p role="status">{t("todos.saving")}</p> : null}
      {error ? (
        <div role="alert">
          <p>{t(error)}</p>
          <Button appearance="subtle" onClick={onRefresh}>
            {t("todos.refresh")}
          </Button>
        </div>
      ) : null}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="ui-disclosure-trigger">
          <ChevronRight aria-hidden className="size-4" />
          {t("todos.attachments.title")} <span>{item.attachments.length}</span>
        </CollapsibleTrigger>
        <CollapsibleContent forceMount inert={!open}>
          <TodoAttachments
            item={item}
            busy={busy}
            uploadBusy={uploadBusy}
            onUpload={onUpload}
            onDelete={onDeleteAttachment}
          />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
