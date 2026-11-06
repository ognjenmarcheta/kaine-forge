import { cn } from "@repo/ui";

/** The lab's four tabs. Components holds the gallery, the kit options, the specimens, and the charts. */
const tabs = [
  { href: "#/", label: "Components", page: "components" },
  { href: "#/tokens", label: "Tokens", page: "tokens" },
  { href: "#/screens", label: "Screens", page: "screens" },
  { href: "#/compare", label: "Compare", page: "compare" }
] as const;

const componentPages = [
  { href: "#/", label: "Gallery", page: "components" },
  { href: "#/options", label: "Options", page: "options" },
  { href: "#/specimens", label: "Specimens", page: "specimens" },
  { href: "#/charts", label: "Charts", page: "charts" }
] as const;

export type LabPage = (typeof tabs)[number]["page"] | (typeof componentPages)[number]["page"];

const LINK =
  "rounded-button px-ds-150 py-ds-075 text-body-sm font-medium text-ds-text-subtle transition-colors duration-control ease-standard hover:bg-ds-bg-neutral-hovered hover:text-ds-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-border-focused";
const CURRENT = "bg-ds-bg-selected text-ds-text-selected";

const isComponentPage = (page: LabPage): boolean =>
  componentPages.some((entry) => entry.page === page);

/**
 * The lab's tabs: Components (with its gallery, options, specimens, and charts), Tokens,
 * Screens, and Compare.
 */
export function LabNav({ current }: { current: LabPage }) {
  const tab = isComponentPage(current) ? "components" : current;
  return (
    <div className="grid gap-ds-050">
      <nav aria-label="Lab" className="flex flex-wrap items-center gap-ds-050">
        {tabs.map((link) => (
          <a
            key={link.page}
            aria-current={link.page === tab ? "page" : undefined}
            className={cn(LINK, link.page === tab && CURRENT)}
            href={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
      {tab === "components" && (
        <nav aria-label="Components" className="flex flex-wrap items-center gap-ds-050">
          {componentPages.map((link) => (
            <a
              key={link.page}
              aria-current={link.page === current ? "page" : undefined}
              className={cn(LINK, "text-body-xs", link.page === current && CURRENT)}
              href={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
