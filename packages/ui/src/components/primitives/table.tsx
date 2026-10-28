import * as React from "react";

import { cn } from "../../lib/cn";

/** Numeric columns align to the end with equal-width digits, so values line up by place. */
const numericClassName = "text-end tabular-nums";

/** A semantic table in its own horizontal scroller, so a wide table never scrolls the page. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
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
}

function TableHead({ className, numeric = false, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-ds-control-large whitespace-nowrap px-ds-150 text-start align-middle text-body-sm font-medium text-ds-text-subtle",
        numeric && numericClassName,
        className
      )}
      {...props}
    />
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
export type { TableCellProps, TableHeadProps };
