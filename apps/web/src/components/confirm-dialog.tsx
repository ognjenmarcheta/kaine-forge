import { Button } from "@repo/ui";

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
  if (!isOpen) {
    return null;
  }

  return (
    <div className="web-dialog-backdrop" role="presentation">
      <section aria-label={title} className="web-dialog" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p className="web-muted">{message}</p>
        <div className="web-form__row">
          <Button disabled={isConfirming} intent="subtle" type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button disabled={isConfirming} intent="danger" type="button" onClick={onConfirm}>
            {isConfirming ? "..." : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
