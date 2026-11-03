import { useT } from "../i18n/i18n.t";
import { NODE_TONE, toneClass } from "../status/status.model";

const LEGEND = ["passed", "running", "waiting", "looped", "failed"] as const;

/** What each color of the graph means. Every entry is a dot and a word. */
export function FlowLegend() {
  const t = useT();
  return (
    <ul className="desk-legend" aria-label={t("desk.flow.legend")}>
      {LEGEND.map((status) => (
        <li key={status} className={`desk-legend__item ${toneClass(NODE_TONE[status])}`}>
          <span className="desk-legend__dot" aria-hidden="true" />
          {t(`desk.flow.status.${status}`)}
        </li>
      ))}
    </ul>
  );
}
