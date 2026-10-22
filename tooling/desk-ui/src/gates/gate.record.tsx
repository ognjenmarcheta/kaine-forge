import type { PlanRisk, RiskOutcome } from "@repo/desk/contracts";
import { useEffect, useState } from "react";

import { useT } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";

/** The outcomes of past plans at each risk, from the run stats. `null` until they load or when they fail. */
function useRiskOutcomes(): readonly RiskOutcome[] | null {
  const { api } = useDesk();
  const [outcomes, setOutcomes] = useState<readonly RiskOutcome[] | null>(null);
  useEffect(() => {
    let current = true;
    api
      .stats()
      .then((stats) => {
        if (current) setOutcomes(stats.riskOutcomes);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [api]);
  return outcomes;
}

/**
 * How past plans of the same risk ended: "Low-risk plans: 9 shipped, 1 sent back". Hidden
 * without a grade, without stats, and while no earlier issue had a plan of that risk.
 */
export function RiskRecord({ risk }: { readonly risk: PlanRisk | null }) {
  const t = useT();
  const outcomes = useRiskOutcomes();
  const outcome = outcomes?.find((entry) => entry.risk === risk);
  if (risk === null || outcome === undefined || outcome.issues === 0) return null;
  return (
    <p className="desk-record">
      {t(`desk.record.${risk}`, { shipped: outcome.shipped, sentBack: outcome.sentBack })}
    </p>
  );
}
