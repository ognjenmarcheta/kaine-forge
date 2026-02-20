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
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <ConfirmModal
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      description={message}
      isConfirming={isConfirming}
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
