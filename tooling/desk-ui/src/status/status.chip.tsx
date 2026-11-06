import type { IssueSummary } from "@repo/desk/contracts";

import { issueStatusOf, TONE_GLYPH, type StatusLabel, type Tone } from "./status.model";
import { stageName } from "../flow/flow.steps";
import { useT, type Translate } from "../i18n/i18n.t";

export const statusLabelText = (t: Translate, label: StatusLabel): string => {
  switch (label.kind) {
    case "key":
      return t(label.key);
    case "stopped":
      if (label.code === null) return t("desk.stage.needs-you");
      return t("desk.chip.stopped", {
        reason:
          label.code === "intake" && label.contract !== null
            ? t("desk.stop.contract", label.contract)
            : t(`desk.stop.${label.code}`)
      });
    case "stage":
      return t("desk.chip.inStage", {
        stage: stageName(t, label.flow, label.stage),
        state: t(`desk.chip.state.${label.state}`)
      });
  }
};

/** A status in words with a glyph of its tone, so the color is never the only signal. */
export function StatusChip({ tone, children }: { readonly tone: Tone; readonly children: string }) {
  return (
    <span className={`dk-st dk-st-${tone}`} data-tone={tone}>
      <span className="dk-g" aria-hidden="true">
        {TONE_GLYPH[tone]}
      </span>
      {children}
    </span>
  );
}

/** The one chip of an issue: its stage and state in one meaningful phrase. */
export function IssueStatusChip({ summary }: { readonly summary: IssueSummary }) {
  const t = useT();
  const status = issueStatusOf(summary);
  return <StatusChip tone={status.tone}>{statusLabelText(t, status.label)}</StatusChip>;
}
