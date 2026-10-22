import { useT } from "../i18n/i18n.t";

/** The flows page. Until its editor lands, it says so. */
export function FlowsView() {
  const t = useT();
  return (
    <div className="desk-heading">
      <div>
        <h1>{t("desk.flows.title")}</h1>
        <p className="desk-muted">{t("desk.flows.soon")}</p>
      </div>
    </div>
  );
}
