import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle
} from "@repo/mobile-ui";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmingLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmingLabel,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isConfirming) onCancel();
      }}
    >
      <DialogOverlay>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              appearance="secondary"
              disabled={isConfirming}
              spacing="compact"
              onPress={onCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              appearance="danger"
              disabled={isConfirming}
              spacing="compact"
              onPress={() => {
                if (!isConfirming) onConfirm();
              }}
            >
              {isConfirming ? confirmingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    </Dialog>
  );
}
