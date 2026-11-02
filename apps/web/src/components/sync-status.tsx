import type { SyncState } from "@repo/sync";
import { Badge, Button } from "@repo/ui";

import { useSyncEngine, useSyncStatus } from "../hooks/use-sync";
import { useTranslation } from "../hooks/use-translation";

const APPEARANCE: Record<SyncState, "success" | "warning" | "information" | "danger"> = {
  online: "success",
  offline: "warning",
  syncing: "information",
  unreachable: "danger",
  error: "danger",
  signedOut: "danger"
};

/** The header's sync state: Online, Offline, Syncing, or what stops sync, with the pending count. */
export function SyncStatusBadge() {
  const status = useSyncStatus();
  const engine = useSyncEngine();
  const { t } = useTranslation();
  if (!status) return null;

  return (
    <div role="status" aria-label={t("sync.status.label")} className="flex items-center gap-ds-050">
      {/* Below the lg width the header has no room for the text: the badge stays as a colored mark. */}
      <Badge appearance={APPEARANCE[status.state]}>
        <span className="sr-only lg:not-sr-only">{t(`sync.status.${status.state}`)}</span>
      </Badge>
      {status.pending > 0 ? (
        <Badge appearance="default" aria-label={t("sync.status.pending")}>
          {status.pending}
        </Badge>
      ) : null}
      {/* Only a failing sync can retry now: offline waits for the network, signed out for sign-in. */}
      {engine && (status.state === "error" || status.state === "unreachable") ? (
        <Button appearance="subtle" spacing="compact" onClick={() => engine.retry()}>
          {t("sync.status.retry")}
        </Button>
      ) : null}
    </div>
  );
}
