import { Modal, type ModalProps } from "./modal";

export interface ConfirmModalProps extends Pick<
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
          intent: "subtle",
          label: cancelLabel,
          onClick: () => onOpenChange(false)
        },
        {
          intent: "danger",
          label: confirmLabel,
          loading: isConfirming,
          onClick: onConfirm
        }
      ]}
      closeButtonLabel={closeButtonLabel}
      closeOnEscape={closeOnEscape}
      closeOnOverlayClick={closeOnOverlayClick}
      description={description}
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton={showCloseButton}
      size={size}
      title={title}
    />
  );
}
