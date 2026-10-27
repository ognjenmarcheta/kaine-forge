/**
 * A mocked list field in the API's `<Type>Connection` shape. The fake cursor
 * is the id of a page's last row; without `first` the whole list is one page.
 */
export function connection<TRow extends { id: string }>(
  rows: readonly TRow[],
  page: { after?: string | null; first?: number } = {}
) {
  const start = page.after ? rows.findIndex((row) => row.id === page.after) + 1 : 0;
  const items = rows.slice(start, start + (page.first ?? rows.length));
  const last = items[items.length - 1];
  return {
    items,
    pageInfo: {
      hasNextPage: start + items.length < rows.length,
      endCursor: last ? last.id : null
    }
  };
}
