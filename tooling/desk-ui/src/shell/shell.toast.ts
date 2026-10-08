import type { ActionName } from "@repo/desk/contracts";
import { toast } from "sonner";

import { failureMessageKey } from "../api/api.errors";
import type { Translate } from "../i18n/i18n.t";
import type { ActionSettled } from "../state/desk.provider";

const withDetail = (detail: string | null): { description?: string } =>
  detail === null || detail.trim() === "" ? {} : { description: detail };

/**
 * The result of an action, as a toast: from a board card or from the issue page. A
 * failure stays until the engineer closes it, because its reason must be read.
 */
export function toastSettled(
  t: Translate,
  issueNumber: number,
  action: ActionName,
  settled: ActionSettled
): void {
  const title = (message: string): string =>
    t("desk.toast.title", { number: issueNumber, message });
  switch (settled.kind) {
    case "error":
      toast.error(title(t(failureMessageKey(settled.code))), {
        ...withDetail(settled.detail),
        duration: Number.POSITIVE_INFINITY
      });
      return;
    case "unknown":
      toast.warning(title(t("desk.action.unknown")));
      return;
    case "accepted":
      toast.success(title(t(`desk.action.accepted.${action}`)));
      return;
    case "done":
      toast.success(title(t(`desk.action.done.${action}`)), withDetail(settled.outcome.message));
  }
}
