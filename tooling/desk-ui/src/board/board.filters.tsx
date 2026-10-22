import type { IssueSummary } from "@repo/desk/contracts";
import { Button } from "@repo/ui";
import { useEffect, useState } from "react";

import { BOARD_FILTERS, COST_FILTER_USD, matchesFilter, type BoardFilter } from "./board.grouping";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatUsd } from "../shell/shell.format";
import { useDesk } from "../state/desk.provider";

const NO_COSTS: ReadonlyMap<number, number> = new Map();

/**
 * The total run cost of each issue, from the run stats, while `enabled`. Without stats (not
 * loaded, or the request failed) the map is empty and the cost filter has no match.
 */
export function useIssueCosts(enabled: boolean): ReadonlyMap<number, number> {
  const { api, state } = useDesk();
  const [costs, setCosts] = useState<ReadonlyMap<number, number>>(NO_COSTS);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    api
      .stats()
      .then((stats) => {
        if (!current) return;
        setCosts(
          new Map(
            stats.issues.flatMap((rollup) =>
              rollup.totalCostUsd === null ? [] : [[rollup.issue, rollup.totalCostUsd] as const]
            )
          )
        );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
    // A finished run changes its issue, so a changed issue list can mean new costs.
  }, [api, enabled, state.issues]);
  return costs;
}

/** Pressed chips with a count. A chip with no match hides, unless it is the chosen one. */
export function FilterChips({
  issues,
  costs,
  value,
  onChange
}: {
  readonly issues: readonly IssueSummary[];
  readonly costs: ReadonlyMap<number, number>;
  readonly value: BoardFilter;
  readonly onChange: (filter: BoardFilter) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const amount = formatUsd(COST_FILTER_USD, language);
  const chips = BOARD_FILTERS.map((filter) => ({
    filter,
    count: issues.filter((summary) => matchesFilter(summary, filter, costs)).length
  })).filter(({ filter, count }) => filter === "all" || filter === value || count > 0);
  return (
    <div className="desk-chips" role="group" aria-label={t("desk.board.filter.label")}>
      {chips.map(({ filter, count }) => (
        <Button
          key={filter}
          type="button"
          appearance="ghost"
          className="desk-chips__chip"
          aria-pressed={filter === value}
          onClick={() => onChange(filter)}
        >
          {t(`desk.board.filter.${filter}`, { amount })}{" "}
          <span className="desk-chips__count">{count}</span>
        </Button>
      ))}
    </div>
  );
}
