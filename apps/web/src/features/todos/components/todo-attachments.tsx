import { formatAttachmentSize } from "@repo/todos";
import { Button } from "@repo/ui";
import { useRef } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

export function TodoAttachments({
  item,
  busy,
  uploadBusy,
  onUpload,
  onDelete
}: {
  item: TodoItem;
  busy: boolean;
  uploadBusy: boolean;
  onUpload: (file: File, item: TodoItem) => void;
  onDelete: (todoId: string, fileId: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="ui-todos__attachments">
      <input
        aria-label={t("todos.attachments.attach")}
        ref={input}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file, item);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        appearance="subtle"
        disabled={busy || uploadBusy}
        onClick={() => input.current?.click()}
      >
        {t("todos.attachments.attach")}
      </Button>
      {item.attachments.length === 0 ? (
        <p>{t("todos.attachments.empty")}</p>
      ) : (
        <ul>
          {item.attachments.map((file) => (
            <li key={file.id}>
              <span className="ui-todos__filename">
                {file.originalName} <small>{formatAttachmentSize(file.sizeBytes)}</small>
              </span>
              <div className="ui-toolbar">
                {file.downloadUrl ? (
                  <a href={file.downloadUrl} target="_blank" rel="noopener noreferrer">
                    {t("todos.attachments.download")}
                  </a>
                ) : null}
                <Button
                  type="button"
                  appearance="subtle"
                  disabled={busy}
                  onClick={() => onDelete(item.id, file.id)}
                >
                  {t("todos.attachments.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
