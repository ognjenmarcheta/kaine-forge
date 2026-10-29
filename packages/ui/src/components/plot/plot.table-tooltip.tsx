import type { ReactNode } from "react";

import { PlotTooltip } from "./plot.overlay";
import type { ChartTableRow } from "../composed/chart.table";

/**
 * The tooltip a plot shows at its active point by default: the point's table row, with the
 * series names beside their values, or `render` for a custom card.
 */
export function PlotTableTooltip({
  describe,
  render,
  table
}: {
  describe: (index: number) => string;
  render: ((index: number) => ReactNode) | undefined;
  table: { columns: readonly string[]; rows: readonly ChartTableRow[] };
}) {
  return (
    <PlotTooltip offset={{ x: 12, y: 0 }}>
      {(index) => {
        if (render !== undefined) return render(index);
        const row = table.rows[index];
        if (row === undefined) return <p className="m-0">{describe(index)}</p>;
        const cells = row.cells.flatMap((cell, column) =>
          cell === "" ? [] : [{ cell, column: table.columns[column] ?? "", key: column }]
        );
        return (
          <>
            <p className="m-0 text-ds-text-subtle">{row.header}</p>
            {row.cells.length === 1 ? (
              <p className="m-0 font-medium tabular-nums">{cells[0]?.cell}</p>
            ) : (
              <dl className="m-0 grid grid-cols-[auto_auto] gap-x-ds-200 gap-y-ds-025">
                {cells.map(({ cell, column, key }) => (
                  <div key={key} className="contents">
                    <dt className="text-ds-text-subtle">{column}</dt>
                    <dd className="m-0 text-end font-medium tabular-nums">{cell}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        );
      }}
    </PlotTooltip>
  );
}
