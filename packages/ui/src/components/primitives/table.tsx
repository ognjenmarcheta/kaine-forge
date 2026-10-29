import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Button } from "./button";
import { cn } from "../../lib/cn";

/** Numeric columns align to the end with equal-width digits, so values line up by place. */
const numericClassName = "text-end tabular-nums";

interface TableProps extends React.ComponentProps<"table"> {
  /** Names the scroller. While the table is wider than its container, keyboard users can focus and scroll it. */
  scrollLabel?: string;
}

/**
 * A semantic table in its own horizontal scroller, so a wide table never scrolls the page.
 * The scroller is positioned, so hidden (`sr-only`) text in a cell stays inside it.
 */
function Table({ className, scrollLabel, ...props }: TableProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = React.useState(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const update = () => setScrolls(container.scrollWidth > container.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className="focus-ring relative w-full overflow-x-auto"
      {...(scrolls
        ? { tabIndex: 0, ...(scrollLabel ? { "aria-label": scrollLabel, role: "region" } : {}) }
        : {})}
    >
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-body text-ds-text", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr data-slot="table-row" className={cn("border-b border-ds-border", className)} {...props} />
  );
}

interface TableHeadProps extends React.ComponentProps<"th"> {
  /** Aligns the column header to the end, over numeric cells. */
  numeric?: boolean;
  /** Makes the header a button that sorts by this column. The caller sorts the rows. */
  onSort?: () => void;
  /** The order the rows are in by this column. Leave it out on the columns that do not sort them now. */
  sort?: "ascending" | "descending";
}

const sortIcons = { ascending: ArrowUp, descending: ArrowDown, none: ChevronsUpDown } as const;

function TableHead({
  children,
  className,
  numeric = false,
  onSort,
  sort,
  ...props
}: TableHeadProps) {
  const SortIcon = sortIcons[sort ?? "none"];

  return (
    <th
      aria-sort={sort}
      data-slot="table-head"
      className={cn(
        "h-ds-control-large whitespace-nowrap px-ds-150 text-start align-middle text-body-sm font-medium text-ds-text-subtle",
        numeric && numericClassName,
        className
      )}
      {...props}
    >
      {onSort ? (
        // The header cell keeps its name; the button inside it sorts, and `aria-sort` on the
        // cell says the order (WAI-ARIA sortable table pattern).
        <Button
          appearance="ghost"
          className="-mx-ds-050 h-auto min-h-ds-control-xsmall gap-ds-050 rounded-sm px-ds-050 font-medium text-current hover:text-ds-text"
          onClick={onSort}
          spacing="compact"
          type="button"
        >
          {children}
          <SortIcon aria-hidden="true" className="size-ds-150 shrink-0" />
        </Button>
      ) : (
        children
      )}
    </th>
  );
}

interface TableCellProps extends React.ComponentProps<"td"> {
  /** Aligns the value to the end with tabular numerals. */
  numeric?: boolean;
}

function TableCell({ className, numeric = false, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-ds-150 py-ds-100 align-middle", numeric && numericClassName, className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("pb-ds-100 text-start text-body-sm text-ds-text-subtle", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
export type { TableCellProps, TableHeadProps, TableProps };
