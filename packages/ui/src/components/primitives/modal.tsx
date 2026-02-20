import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "../../lib/cn";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalAction {
  disabled?: boolean;
  intent?: "danger" | "primary" | "subtle";
  label: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}

export interface ModalProps {
  actions?: ModalAction[];
  children?: ReactNode;
  closeButtonLabel?: string;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  description?: string;
  footer?: ReactNode;
  hideFooter?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  showCloseButton?: boolean;
  size?: ModalSize;
  title: string;
}

const MODAL_SIZE_CLASS_BY_VALUE: Record<ModalSize, string> = {
  sm: "ui-modal__content--sm",
  md: "ui-modal__content--md",
  lg: "ui-modal__content--lg",
  xl: "ui-modal__content--xl",
  full: "ui-modal__content--full"
};

export function resolveModalSizeClass(size: ModalSize = "md"): string {
  return MODAL_SIZE_CLASS_BY_VALUE[size];
}

function renderActions(actions: ModalAction[]) {
  return (
    <div className="ui-modal__actions">
      {actions.map((action, index) => (
        <Button
          key={index}
          disabled={action.disabled || action.loading}
          intent={action.intent}
          type={action.type ?? "button"}
          onClick={action.onClick}
        >
          {action.loading ? "..." : action.label}
        </Button>
      ))}
    </div>
  );
}

export function Modal({
  actions = [],
  children,
  closeButtonLabel = "Close",
  closeOnEscape = true,
  closeOnOverlayClick = true,
  description,
  footer,
  hideFooter = false,
  onOpenChange,
  open,
  showCloseButton = true,
  size = "md",
  title
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal__overlay" />
        <Dialog.Content
          aria-label={title}
          className={cn("ui-modal__content", resolveModalSizeClass(size))}
          onEscapeKeyDown={(event) => {
            if (!closeOnEscape) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (!closeOnOverlayClick) {
              event.preventDefault();
            }
          }}
        >
          <header className="ui-modal__header">
            <div className="ui-modal__header-text">
              <Dialog.Title className="ui-modal__title">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="ui-modal__description">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            {showCloseButton ? (
              <Dialog.Close asChild>
                <button aria-label={closeButtonLabel} className="ui-modal__close" type="button">
                  x
                </button>
              </Dialog.Close>
            ) : null}
          </header>
          <div className="ui-modal__body">{children}</div>
          {!hideFooter ? (
            <footer className="ui-modal__footer">
              {footer ?? (actions.length > 0 ? renderActions(actions) : null)}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
