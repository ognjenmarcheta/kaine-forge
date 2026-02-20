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
  submitLabel: string;
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
  submitLabel,
  title
}: FormModalProps) {
  const formId = useId();

  return (
    <Modal
      closeButtonLabel={closeButtonLabel}
      closeOnEscape={closeOnEscape}
      closeOnOverlayClick={closeOnOverlayClick}
      description={description}
      footer={
        <div className="ui-modal__actions">
          <Button intent="subtle" type="button" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button disabled={isSubmitting} form={formId} type="submit">
            {isSubmitting ? "..." : submitLabel}
          </Button>
        </div>
      }
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton={showCloseButton}
      size={size}
      title={title}
    >
      <form
        className="ui-form"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(event);
        }}
      >
        {children}
      </form>
    </Modal>
  );
}
