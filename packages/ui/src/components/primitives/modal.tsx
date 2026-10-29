import { XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRef, type ReactNode } from "react";

import { Button } from "./button";
import { contextMenuOpener } from "./context-menu";
import { cn } from "../../lib/cn";

const MENU_CONTENT = "[data-radix-menu-content]";

/**
 * The element a dialog returns focus to: the one that had focus when it opened. A menu item goes
 * away with its menu, so a dialog opened from one returns focus to what opened that menu: the
 * trigger that labels it (a sub-menu's trigger is an item of its parent menu), or, for a context
 * menu, which has no trigger button, the element that had focus before it opened.
 */
function resolveReturnFocusTarget(element: Element | null): HTMLElement | null {
  let target = element;
  let menu = target?.closest(MENU_CONTENT) ?? null;
  while (target !== null && menu !== null) {
    const triggerId = menu.getAttribute("aria-labelledby");
    target = triggerId
      ? menu.ownerDocument.getElementById(triggerId)
      : (contextMenuOpener(menu) ?? null);
    menu = target?.closest(MENU_CONTENT) ?? null;
  }
  return target instanceof HTMLElement && target !== target.ownerDocument.body ? target : null;
}

export interface DialogReturnFocus {
  onCloseAutoFocus: (event: Event) => void;
  onOpenAutoFocus: () => void;
}

/**
 * Returns focus to the dialog's opener when it closes, also when no Radix Trigger opened it: a
 * button that sets state, or a menu item (see resolveReturnFocusTarget). The opener is read when
 * the dialog takes focus; a menu item still has focus then, because Radix runs the item's
 * `onSelect` before it closes the menu. Modal, AlertDialogContent, and SheetContent use it.
 */
export function useDialogReturnFocus(): DialogReturnFocus {
  const target = useRef<HTMLElement | null>(null);

  return {
    onCloseAutoFocus: (event) => {
      if (event.defaultPrevented || !target.current?.isConnected) return;
      event.preventDefault();
      target.current.focus();
    },
    onOpenAutoFocus: () => {
      target.current = resolveReturnFocusTarget(document.activeElement);
    }
  };
}

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalAction {
  appearance?: "danger" | "default" | "ghost" | "link" | "secondary" | "subtle" | "warning";
  disabled?: boolean;
  label: ReactNode;
  loadingLabel?: ReactNode;
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
  onCloseAutoFocus?: (event: Event) => void;
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
          type={action.type ?? "button"}
          onClick={action.onClick}
          {...(action.appearance ? { appearance: action.appearance } : {})}
        >
          {action.loading ? (action.loadingLabel ?? action.label) : action.label}
        </Button>
      ))}
    </div>
  );
}

export function Modal({
  actions = [],
  children,
  closeButtonLabel,
  closeOnEscape = true,
  closeOnOverlayClick = true,
  description,
  footer,
  hideFooter = false,
  onCloseAutoFocus,
  onOpenChange,
  open,
  showCloseButton = true,
  size = "md",
  title
}: ModalProps) {
  const returnFocus = useDialogReturnFocus();
  const resolvedCloseButtonLabel = closeButtonLabel ?? "Close";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal__overlay" />
        <Dialog.Content
          aria-label={title}
          onOpenAutoFocus={returnFocus.onOpenAutoFocus}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            returnFocus.onCloseAutoFocus(event);
          }}
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
                <Button
                  aria-label={resolvedCloseButtonLabel}
                  className="ui-modal__close"
                  appearance="subtle"
                  spacing="compact"
                  type="button"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </Button>
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
