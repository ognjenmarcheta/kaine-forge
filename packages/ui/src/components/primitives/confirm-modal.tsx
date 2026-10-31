import { Modal, type ModalProps } from "./modal";

export interface ConfirmModalProps extends Pick<
  ModalProps,
  | "closeButtonLabel"
  | "closeOnEscape"
  | "closeOnOverlayClick"
  | "description"
  | "onCloseAutoFocus"
  | "onOpenChange"
  | "open"
  | "showCloseButton"
  | "size"
  | "title"
> {
  cancelLabel: string;
  confirmLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
}

export function ConfirmModal({
  cancelLabel,
  closeButtonLabel,
  closeOnEscape,
  closeOnOverlayClick,
  confirmLabel,
  description,
  isConfirming = false,
  onCloseAutoFocus,
  onConfirm,
  onOpenChange,
  open,
  showCloseButton,
  size,
  title
}: ConfirmModalProps) {
  return (
    <Modal
      actions={[
        {
          appearance: "subtle",
          label: cancelLabel,
          disabled: isConfirming,
          onClick: () => onOpenChange(false)
        },
        {
          appearance: "danger",
          label: confirmLabel,
          loading: isConfirming,
          onClick: () => {
            if (!isConfirming) onConfirm();
          }
        }
      ]}
      {...(closeButtonLabel ? { closeButtonLabel } : {})}
      closeOnEscape={!isConfirming && (closeOnEscape ?? true)}
      closeOnOverlayClick={!isConfirming && (closeOnOverlayClick ?? true)}
      {...(description ? { description } : {})}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      onOpenChange={(nextOpen) => {
        if (!isConfirming) onOpenChange(nextOpen);
      }}
      open={open}
      showCloseButton={!isConfirming && (showCloseButton ?? true)}
      {...(size ? { size } : {})}
      title={title}
    />
  );
}
