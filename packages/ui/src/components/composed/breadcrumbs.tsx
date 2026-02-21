import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ className, items, ...props }, ref) => (
    <nav ref={ref} aria-label="Breadcrumb" className={cn(className)} {...props}>
      <ol className="flex items-center gap-1 text-body-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--ds-icon-subtle)]" />
              )}
              {isLast || !item.href ? (
                <span
                  className={cn(
                    "font-medium",
                    isLast ? "text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-subtle)]"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className="text-[color:var(--ds-link)] hover:underline">
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  )
);
Breadcrumbs.displayName = "Breadcrumbs";

export { Breadcrumbs };
export type { BreadcrumbsProps, BreadcrumbItem };
