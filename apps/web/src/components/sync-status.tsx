import type { SyncState } from "@repo/sync";
import { Badge } from "@repo/ui";

import { useSyncStatus } from "../hooks/use-sync";
import { useTranslation } from "../hooks/use-translation";

const APPEARANCE: Record<SyncState, "success" | "warning" | "information" | "danger"> = {
  online: "success",
  offline: "warning",
  syncing: "information",
  error: "danger",
  signedOut: "danger"
};

/** The header's sync state: Online, Offline, Syncing, or what stops sync, with the pending count. */
export function SyncStatusBadge() {
  const status = useSyncStatus();
  const { t } = useTranslation();
  if (!status) return null;

  return (
    <div role="status" aria-label={t("sync.status.label")} className="flex items-center gap-ds-050">
      <Badge appearance={APPEARANCE[status.state]}>{t(`sync.status.${status.state}`)}</Badge>
      {status.pending > 0 ? (
        <Badge appearance="default" aria-label={t("sync.status.pending")}>
          {status.pending}
        </Badge>
      ) : null}
    </div>
  );
}
