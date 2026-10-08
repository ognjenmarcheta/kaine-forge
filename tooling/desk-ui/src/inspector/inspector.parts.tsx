import { Check, Minus, Skeleton, TriangleAlert, X } from "@repo/ui";
import type { ReactNode } from "react";

import type { Anomaly, CheckItem, CheckState, ItemText, Kpi } from "./inspector.model";
import { ANOMALY_TONE } from "./inspector.model";
import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { formatDuration } from "../shell/shell.format";
import { toneClass } from "../status/status.model";

export const itemText = (t: Translate, text: ItemText): string =>
  text.kind === "raw" ? text.text : t(text.key, text.values);

const STATE_ICON: Readonly<Record<CheckState, ReactNode>> = {
  pass: <Check aria-hidden="true" className="desk-icon" />,
  fail: <X aria-hidden="true" className="desk-icon" />,
  warn: <TriangleAlert aria-hidden="true" className="desk-icon" />,
  pending: <Minus aria-hidden="true" className="desk-icon" />
};

/**
 * Rows with a ✓, ✗, ! or – and the state in words for a screen reader. A failing row has a
 * danger tint, so the problem stands out without relying on color alone.
 */
export function Checklist({
  label,
  items,
  extra
}: {
  readonly label: string;
  readonly items: readonly CheckItem[];
  /** More content under a row, such as the output of a failed step. */
  readonly extra?: (item: CheckItem) => ReactNode;
}) {
  const t = useT();
  const { language } = useLanguage();
  if (items.length === 0) return null;
  return (
    <ul className="desk-checklist" aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className="desk-checklist__item" data-state={item.state}>
          <span className="desk-checklist__icon" aria-hidden="true">
            {STATE_ICON[item.state]}
          </span>
          <span className="desk-checklist__body">
            <span className="desk-sr-only">
              {t("desk.inspector.stateLabel", {
                state: t(`desk.inspector.state.${item.state}`)
              })}
            </span>
            <span className="desk-checklist__text">{itemText(t, item.text)}</span>
            {item.detail !== null && (
              <span className="desk-checklist__detail">{itemText(t, item.detail)}</span>
            )}
            {extra?.(item)}
          </span>
          {item.durationMs !== undefined && (
            <span className="desk-checklist__duration">
              {formatDuration(item.durationMs, language)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function KpiValueText({ kpi }: { readonly kpi: Kpi }) {
  const t = useT();
  const { language } = useLanguage();
  const { value } = kpi;
  switch (value.kind) {
    case "count":
      return <>{value.value}</>;
    case "ratio":
      return <>{t("desk.inspector.kpi.ratio", { value: value.value, total: value.total })}</>;
    case "duration":
      return <>{formatDuration(value.ms, language)}</>;
    case "findings":
      return (
        <>
          {value.total}
          <small className="desk-kpi__note">
            {t("desk.inspector.kpi.blocking", { count: value.blocking })}
          </small>
        </>
      );
    case "text":
      return <code>{value.text}</code>;
    case "none":
      return (
        <>
          <span aria-hidden="true">{t("desk.inspector.kpi.empty")}</span>
          <span className="desk-sr-only">{t("desk.common.none")}</span>
        </>
      );
    case "loading":
      return (
        <>
          <Skeleton className="desk-kpi__skeleton" aria-hidden="true" />
          <span className="desk-sr-only">{t("desk.common.loading")}</span>
        </>
      );
  }
}

/** Tiles of one size in a fixed grid, so a value that loads or ticks moves nothing. */
export function KpiGrid({ kpis }: { readonly kpis: readonly Kpi[] }) {
  const t = useT();
  return (
    <dl className="desk-kpis">
      {kpis.map((kpi) => (
        <div key={kpi.id} className={`desk-kpi ${toneClass(kpi.tone)}`} data-tone={kpi.tone}>
          <dt>{t(kpi.label)}</dt>
          <dd>
            <KpiValueText kpi={kpi} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

const anomalyText = (t: Translate, anomaly: Anomaly): string => {
  switch (anomaly.kind) {
    case "loop":
      return t(`desk.inspector.anomaly.loop.${anomaly.loop}`, { count: anomaly.count });
    case "needs-you":
      return t("desk.inspector.anomaly.needsYou", { reason: anomaly.excerpt });
    case "denials":
      return t("desk.inspector.anomaly.denials", { count: anomaly.count });
    case "same-failure":
      return t("desk.inspector.anomaly.sameFailure");
    case "cancelled":
      return t("desk.flow.badge.cancelled");
  }
};

/** What went wrong or around in the stage, as chips with an icon and words. */
export function Anomalies({ anomalies }: { readonly anomalies: readonly Anomaly[] }) {
  const t = useT();
  if (anomalies.length === 0) return null;
  return (
    <section className="desk-inspector__section">
      <h3>{t("desk.inspector.anomalies")}</h3>
      <ul className="desk-anomalies">
        {anomalies.map((anomaly, index) => (
          <li
            key={`${anomaly.kind}-${String(index)}`}
            className={`desk-anomaly ${toneClass(ANOMALY_TONE[anomaly.kind])}`}
          >
            <TriangleAlert aria-hidden="true" className="desk-icon" />
            <span>{anomalyText(t, anomaly)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
