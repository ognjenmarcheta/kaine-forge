import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  ariaLabel: string;
  currentPage: number;
  firstPageLabel: string;
  lastPageLabel: string;
  nextPageLabel: string;
  totalPages: number;
  onPageChange: (page: number) => void;
  previousPageLabel: string;
  siblingCount?: number;
}

function getPageNumbers(
  currentPage: number,
  totalPages: number,
  siblingCount: number
): (number | "ellipsis")[] {
  const totalSlots = siblingCount * 2 + 5;
  if (totalPages <= totalSlots) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  const pages: (number | "ellipsis")[] = [1];

  if (showLeftEllipsis) {
    pages.push("ellipsis");
  } else {
    for (let i = 2; i < leftSibling; i++) pages.push(i);
  }

  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== totalPages) pages.push(i);
  }

  if (showRightEllipsis) {
    pages.push("ellipsis");
  } else {
    for (let i = rightSibling + 1; i < totalPages; i++) pages.push(i);
  }

  if (totalPages > 1) pages.push(totalPages);

  return pages;
}

const paginationButtonClass =
  "inline-flex h-[var(--ds-control-medium)] w-[var(--ds-control-medium)] items-center justify-center rounded-[var(--ds-radius-200)] text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-focused)] disabled:pointer-events-none disabled:opacity-50";

const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  (
    {
      ariaLabel,
      className,
      currentPage,
      firstPageLabel,
      lastPageLabel,
      nextPageLabel,
      onPageChange,
      previousPageLabel,
      siblingCount = 1,
      totalPages,
      ...props
    },
    ref
  ) => {
    const pages = getPageNumbers(currentPage, totalPages, siblingCount);

    return (
      <nav
        ref={ref}
        role="navigation"
        aria-label={ariaLabel}
        className={cn("flex items-center gap-1", className)}
        {...props}
      >
        {/* eslint-disable no-restricted-syntax */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className={cn(
            paginationButtonClass,
            "text-[color:var(--ds-icon-subtle)] hover:bg-[var(--ds-background-neutral-subtle-hovered)]"
          )}
          aria-label={firstPageLabel}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={cn(
            paginationButtonClass,
            "text-[color:var(--ds-icon-subtle)] hover:bg-[var(--ds-background-neutral-subtle-hovered)]"
          )}
          aria-label={previousPageLabel}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((page, i) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${i}`}
              className="flex h-[var(--ds-control-medium)] w-[var(--ds-control-medium)] items-center justify-center text-[color:var(--ds-text-subtlest)]"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={page === currentPage ? "page" : undefined}
              className={cn(
                paginationButtonClass,
                page === currentPage
                  ? "bg-[var(--ds-background-selected-bold)] text-[color:var(--ds-text-inverse)]"
                  : "text-[color:var(--ds-text)] hover:bg-[var(--ds-background-neutral-subtle-hovered)]"
              )}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={cn(
            paginationButtonClass,
            "text-[color:var(--ds-icon-subtle)] hover:bg-[var(--ds-background-neutral-subtle-hovered)]"
          )}
          aria-label={nextPageLabel}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className={cn(
            paginationButtonClass,
            "text-[color:var(--ds-icon-subtle)] hover:bg-[var(--ds-background-neutral-subtle-hovered)]"
          )}
          aria-label={lastPageLabel}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
        {/* eslint-enable no-restricted-syntax */}
      </nav>
    );
  }
);
Pagination.displayName = "Pagination";

export { Pagination };
export type { PaginationProps };
