import { Button, Field, FieldError, FieldLabel, Input, Modal, Textarea } from "@repo/ui";
import { useId } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoDraft } from "../todos.type";
import { validTodo } from "../todos.util";

interface TodoFormDialogProps {
  open: boolean;
  draft: TodoDraft;
  onChange: (draft: TodoDraft) => void;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSave: () => void;
  pending: boolean;
  error?: string | undefined;
  editing?: boolean;
  unchanged?: boolean;
  deleted?: boolean;
  externalChange?: boolean;
  onReload?: () => void;
  onCopy?: () => void;
  onRefresh: () => void;
}

export function TodoFormDialog({
  open,
  draft,
  onChange,
  onClose,
  onCloseAutoFocus,
  onSave,
  pending,
  error,
  editing = false,
  unchanged = false,
  deleted = false,
  externalChange = false,
  onReload,
  onCopy,
  onRefresh
}: TodoFormDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const canSave = validTodo(draft) && !unchanged && !pending && !deleted;
  return (
    <Modal
      open={open}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      title={t(editing ? "todos.editTitle" : "todos.create")}
      closeButtonLabel={t("common.close")}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
      closeOnEscape={!pending}
      closeOnOverlayClick={!pending}
      showCloseButton={!pending}
      footer={
        <div className="ui-modal__actions">
          <Button appearance="subtle" disabled={pending} onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button type="submit" form={id} disabled={!canSave}>
            {t(
              pending
                ? "todos.saving"
                : externalChange
                  ? "todos.saveLocal"
                  : editing
                    ? "button.save"
                    : "todos.add"
            )}
          </Button>
        </div>
      }
    >
      <form
        id={id}
        className="ui-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            if (event.key === "Enter") event.preventDefault();
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (canSave) onSave();
          }
        }}
      >
        {deleted ? (
          <div role="alert">
            <p>{t("todos.externallyDeleted")}</p>
            <Button type="button" appearance="subtle" onClick={onCopy}>
              {t("todos.copyDraft")}
            </Button>
          </div>
        ) : externalChange ? (
          <div role="status">
            <p>{t("todos.externalUpdate")}</p>
            <Button type="button" appearance="subtle" disabled={pending} onClick={onReload}>
              {t("todos.reloadLatest")}
            </Button>
          </div>
        ) : null}
        <Field>
          <FieldLabel htmlFor={id + "-title"}>{t("todos.form.titlePlaceholder")}</FieldLabel>
          <Input
            id={id + "-title"}
            value={draft.title}
            disabled={pending}
            readOnly={deleted}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            aria-invalid={!validTodo(draft)}
            aria-describedby={id + "-validation"}
          />
          {!validTodo(draft) ? (
            <FieldError id={id + "-validation"}>{t("todos.titleValidation")}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={id + "-description"}>
            {t("todos.form.descriptionPlaceholder")}
          </FieldLabel>
          <Textarea
            id={id + "-description"}
            rows={6}
            value={draft.description}
            disabled={pending}
            readOnly={deleted}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
          />
        </Field>
        {error ? (
          <div>
            <FieldError>{t(error)}</FieldError>
            <Button type="button" appearance="subtle" onClick={onRefresh}>
              {t("todos.refresh")}
            </Button>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
