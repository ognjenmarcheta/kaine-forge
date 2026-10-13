import type { IssueSummary } from "@repo/desk/contracts";
import { Badge } from "@repo/ui";

import { appearanceOf, issueStatusOf, type StatusLabel, type Tone } from "./status.model";
import { useT, type Translate } from "../i18n/i18n.t";

export const statusLabelText = (t: Translate, label: StatusLabel): string =>
  label.kind === "key"
    ? t(label.key)
    : t("desk.chip.inStage", {
        stage: t(`desk.stage.${label.stage}`),
        state: t(`desk.chip.state.${label.state}`)
      });

/** A status in words with a dot of its color, so the color is never the only signal. */
export function StatusChip({ tone, children }: { readonly tone: Tone; readonly children: string }) {
  return (
    <Badge appearance={appearanceOf(tone)} className="desk-chip" data-tone={tone}>
      <span className="desk-chip__dot" aria-hidden="true" />
      {children}
    </Badge>
  );
}

/** The one chip of an issue: its stage and state in one meaningful phrase. */
export function IssueStatusChip({ summary }: { readonly summary: IssueSummary }) {
  const t = useT();
  const status = issueStatusOf(summary);
  return <StatusChip tone={status.tone}>{statusLabelText(t, status.label)}</StatusChip>;
}
