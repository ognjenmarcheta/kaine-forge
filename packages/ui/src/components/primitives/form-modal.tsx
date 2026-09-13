import type { FormEvent, ReactNode } from "react";
import { useId } from "react";

import { Button } from "./button";
import { Modal, type ModalProps } from "./modal";

export interface FormModalProps extends Pick<
  ModalProps,
  | "closeButtonLabel"
  | "closeOnEscape"
  | "closeOnOverlayClick"
  | "description"
  | "onOpenChange"
  | "open"
  | "showCloseButton"
  | "size"
  | "title"
> {
  cancelLabel: string;
  children: ReactNode;
  isSubmitting?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  submittingLabel?: string;
  submitLabel: string;
  submitDisabled?: boolean;
}

export function FormModal({
  cancelLabel,
  children,
  closeButtonLabel,
  closeOnEscape,
  closeOnOverlayClick,
  description,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
  open,
  showCloseButton,
  size,
  submittingLabel,
  submitLabel,
  submitDisabled = false,
  title
}: FormModalProps) {
  const formId = useId();

  return (
    <Modal
      {...(closeButtonLabel ? { closeButtonLabel } : {})}
      closeOnEscape={!isSubmitting && (closeOnEscape ?? true)}
      closeOnOverlayClick={!isSubmitting && (closeOnOverlayClick ?? true)}
      {...(description ? { description } : {})}
      footer={
        <div className="ui-modal__actions">
          <Button
            disabled={isSubmitting}
            appearance="subtle"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button disabled={isSubmitting || submitDisabled} form={formId} type="submit">
            {isSubmitting ? (submittingLabel ?? submitLabel) : submitLabel}
          </Button>
        </div>
      }
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) onOpenChange(nextOpen);
      }}
      open={open}
      showCloseButton={!isSubmitting && (showCloseButton ?? true)}
      {...(size ? { size } : {})}
      title={title}
    >
      <form
        className="ui-form"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (!isSubmitting && !submitDisabled) void onSubmit(event);
        }}
      >
        <fieldset
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="m-0 min-w-0 border-0 p-0 grid gap-[var(--ds-space-200)]"
        >
          {children}
        </fieldset>
      </form>
    </Modal>
  );
}
