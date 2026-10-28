import { cn } from "@repo/ui";

const links = [
  { href: "#/", label: "Components", page: "components" },
  { href: "#/screens", label: "Screens", page: "screens" }
] as const;

/** The lab's two pages: the component gallery and the recreated screens. */
export function LabNav({ current }: { current: (typeof links)[number]["page"] }) {
  return (
    <nav aria-label="Lab" className="flex items-center gap-ds-050">
      {links.map((link) => (
        <a
          key={link.page}
          aria-current={link.page === current ? "page" : undefined}
          className={cn(
            "rounded-button px-ds-150 py-ds-075 text-body-sm font-medium text-ds-text-subtle transition-colors duration-control ease-standard hover:bg-ds-bg-neutral-hovered hover:text-ds-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-border-focused",
            link.page === current && "bg-ds-bg-selected text-ds-text-selected"
          )}
          href={link.href}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
