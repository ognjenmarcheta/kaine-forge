import { ConfirmModal } from "@repo/ui";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Where focus goes when the dialog closes; call `event.preventDefault()` to take it over. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
  onCloseAutoFocus
}: ConfirmDialogProps) {
  return (
    <ConfirmModal
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      description={message}
      isConfirming={isConfirming}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      open={isOpen}
      title={title}
      onConfirm={onConfirm}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    />
  );
}
