import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { ConfirmDialog } from "../../components/confirm-dialog";
import { useTranslation } from "../../hooks/use-translation";

interface NotesProtection {
  dirty: boolean;
  pending: boolean;
}
interface NotesNavigation {
  setProtection: (protection: NotesProtection) => void;
  requestLeave: (action: () => void) => void;
}
const NotesNavigationContext = createContext<NotesNavigation | null>(null);

export function NotesNavigationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [protection, setProtection] = useState<NotesProtection>({ dirty: false, pending: false });
  const [action, setAction] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (action && !protection.dirty && !protection.pending) {
      setAction(null);
      action();
    }
  }, [action, protection]);
  return (
    <NotesNavigationContext.Provider
      value={{
        setProtection,
        requestLeave: (next) => {
          if (protection.dirty || protection.pending) setAction(() => next);
          else next();
        }
      }}
    >
      {children}
      <ConfirmDialog
        isOpen={Boolean(action)}
        title={t("notes.leaveTitle")}
        message={t(protection.pending ? "notes.waitForSave" : "notes.leaveMessage")}
        confirmLabel={t("notes.discardLeave")}
        cancelLabel={t("notes.keepEditing")}
        isConfirming={protection.pending}
        onCancel={() => setAction(null)}
        onConfirm={() => {
          if (!protection.pending) {
            setAction(null);
            action?.();
          }
        }}
      />
    </NotesNavigationContext.Provider>
  );
}

export function useNotesNavigation() {
  const context = useContext(NotesNavigationContext);
  if (!context) throw new Error("NotesNavigationProvider is required");
  return context;
}
