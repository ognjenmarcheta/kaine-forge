import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface SidebarProps {
  collapsed: boolean;
  children: ReactNode;
  onToggle: () => void;
}

export function Sidebar({ collapsed, children, onToggle }: SidebarProps) {
  return (
    <aside className={cn("ui-sidebar", collapsed ? "ui-sidebar--collapsed" : null)}>
      <nav className="ui-sidebar__nav">{children}</nav>
      <button className="ui-sidebar__toggle" type="button" onClick={onToggle}>
        {collapsed ? ">>" : "<<"}
      </button>
    </aside>
  );
}
