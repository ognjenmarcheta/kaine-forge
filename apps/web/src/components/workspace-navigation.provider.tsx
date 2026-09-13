import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { useTranslation } from "../hooks/use-translation";

interface WorkspaceProtection {
  dirty: boolean;
  pending: boolean;
  feature?: "notes" | "todos";
}
interface WorkspaceNavigation {
  setProtection: (protection: WorkspaceProtection) => void;
  requestLeave: (action: () => void) => void;
}
const WorkspaceNavigationContext = createContext<WorkspaceNavigation | null>(null);

export function WorkspaceNavigationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [protection, setProtection] = useState<WorkspaceProtection>({
    dirty: false,
    pending: false
  });
  const [action, setAction] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (action && !protection.dirty && !protection.pending) {
      setAction(null);
      action();
    }
  }, [action, protection]);
  return (
    <WorkspaceNavigationContext.Provider
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
        title={t(`${protection.feature ?? "notes"}.leaveTitle`)}
        message={t(
          `${protection.feature ?? "notes"}.${protection.pending ? "waitForSave" : "leaveMessage"}`
        )}
        confirmLabel={t(`${protection.feature ?? "notes"}.discardLeave`)}
        cancelLabel={t(`${protection.feature ?? "notes"}.keepEditing`)}
        isConfirming={protection.pending}
        onCancel={() => setAction(null)}
        onConfirm={() => {
          if (!protection.pending) {
            setAction(null);
            action?.();
          }
        }}
      />
    </WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigation() {
  const context = useContext(WorkspaceNavigationContext);
  if (!context) throw new Error("WorkspaceNavigationProvider is required");
  return context;
}
