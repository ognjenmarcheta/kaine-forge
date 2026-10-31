import { formatAttachmentSize } from "@repo/todos";
import { Button } from "@repo/ui";
import { useRef, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import type { AttachmentLinks } from "../todos-attachment-links.hook";
import type { TodoItem } from "../todos.type";

/** A Todo's Attachments. `links` holds their signed URLs, which need the network. */
export function TodoAttachments({
  item,
  links,
  offline,
  busy,
  uploadBusy,
  onUpload,
  onDelete
}: {
  item: TodoItem;
  links: Record<string, AttachmentLinks>;
  offline: boolean;
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
        disabled={busy || uploadBusy || offline}
        onClick={() => input.current?.click()}
      >
        {t("todos.attachments.attach")}
      </Button>
      {offline ? <p>{t("todos.attachments.offline")}</p> : null}
      {item.attachments.length === 0 ? (
        <p>{t("todos.attachments.empty")}</p>
      ) : (
        <ul>
          {item.attachments.map((file) => {
            const { downloadUrl, thumbnailUrl } = links[file.id] ?? {};
            return (
              <li key={file.id}>
                {thumbnailUrl ? <AttachmentThumbnail src={thumbnailUrl} /> : null}
                <span className="ui-todos__filename">
                  {file.originalName} <small>{formatAttachmentSize(file.sizeBytes)}</small>
                </span>
                <div className="ui-toolbar">
                  {downloadUrl ? (
                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                      {t("todos.attachments.download")}
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    appearance="subtle"
                    disabled={busy || offline}
                    onClick={() => onDelete(item.id, file.id)}
                  >
                    {t("todos.attachments.delete")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// An image uploaded before thumbnails existed has no thumbnail object, so its
// signed URL returns 404; show the file row without a broken image.
function AttachmentThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      alt=""
      className="ui-todos__thumbnail"
      loading="lazy"
      src={src}
      onError={() => setFailed(true)}
    />
  );
}
