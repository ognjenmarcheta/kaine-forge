import type { ContractProgress } from "@repo/desk/contracts";
import { Badge } from "@repo/ui";

import { useTextArtifact } from "./artifact.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, ItemList, Loading, Muted, Pre, Section } from "../shell/shell.ui";

/** The issue text intake wrote, as plain text, with how much of the six-heading contract it has. */
export function TicketArtifact({
  issueNumber,
  revision,
  contract
}: {
  readonly issueNumber: number;
  readonly revision: string;
  readonly contract: ContractProgress | null;
}) {
  const t = useT();
  const state = useTextArtifact(issueNumber, "ticket", revision);
  return (
    <div className="desk-artifact">
      {contract !== null && (
        <Section title={t("desk.ticket.contract")}>
          <p>
            <Badge appearance={contract.found === contract.total ? "success" : "warning"}>
              {t("desk.ticket.contractProgress", { found: contract.found, total: contract.total })}
            </Badge>
          </p>
          {contract.missing.length > 0 && (
            <>
              <Muted>{t("desk.ticket.missing")}</Muted>
              <ItemList empty="" items={contract.missing} render={(name) => <code>{name}</code>} />
            </>
          )}
        </Section>
      )}
      {state.status === "loading" && <Loading />}
      {state.status === "missing" && <Muted>{t("desk.artifact.missing")}</Muted>}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && (
        <Section title={t("desk.ticket.text")}>
          <Pre label={t("desk.ticket.text")}>{state.value}</Pre>
        </Section>
      )}
    </div>
  );
}
