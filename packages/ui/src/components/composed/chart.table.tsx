export interface ChartTableRow {
  header: string;
  cells: string[];
}

/** The chart's data for screen readers, with the series names as column headers. */
export function ChartTable({ columns, rows }: { columns: string[]; rows: ChartTableRow[] }) {
  return (
    // A table ignores the 1px box of `sr-only` and keeps its full size, which lengthens or
    // widens the page; the block wrapper clips it to 1px, and screen readers still read it.
    <div className="sr-only">
      <table>
        {columns.length === 0 ? null : (
          <thead>
            <tr>
              <td />
              {columns.map((column, position) => (
                <th key={position} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, position) => (
            <tr key={position}>
              <th scope="row">{row.header}</th>
              {row.cells.map((cell, cellPosition) => (
                <td key={cellPosition}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
