import { type ShellSelectControlProps, ShellSelectControl } from "./shell-select-control";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "../primitives/sidebar";

type BaseControlProps = Omit<ShellSelectControlProps, "className" | "display" | "icon">;

export interface NavPreferencesProps {
  groupLabel?: string;
  layout?: "inline-icons" | "stack" | "footer";
  language: BaseControlProps;
  theme: BaseControlProps;
}

export function NavPreferences({
  groupLabel,
  language,
  layout = "stack",
  theme
}: NavPreferencesProps) {
  if (layout === "footer") {
    return (
      <div className="ui-sidebar-preferences-footer" role="group" aria-label={groupLabel}>
        <ShellSelectControl display="compact" icon="language" {...language} />
        <ShellSelectControl display="compact" icon="theme" {...theme} />
      </div>
    );
  }

  if (layout === "inline-icons") {
    return (
      <div className="ui-sidebar-preferences">
        <ShellSelectControl className="size-8" display="icon" icon="language" {...language} />
        <ShellSelectControl className="size-8" display="icon" icon="theme" {...theme} />
      </div>
    );
  }

  return (
    <SidebarGroup>
      {groupLabel ? <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel> : null}
      <SidebarGroupContent className="space-y-[var(--ds-space-100)]">
        <ShellSelectControl className="w-full min-w-0 max-w-none" icon="language" {...language} />
        <ShellSelectControl className="w-full min-w-0 max-w-none" icon="theme" {...theme} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
