import { type ShellSelectControlProps, ShellSelectControl } from "./shell-select-control";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "../primitives/sidebar";

type BaseControlProps = Omit<ShellSelectControlProps, "className" | "display" | "icon">;

export interface NavPreferencesProps {
  groupLabel?: string;
  layout?: "inline-icons" | "stack";
  language: BaseControlProps;
  theme: BaseControlProps;
}

export function NavPreferences({
  groupLabel,
  language,
  layout = "stack",
  theme
}: NavPreferencesProps) {
  if (layout === "inline-icons") {
    return (
      <div className="flex items-center justify-start gap-[var(--ds-space-100)] px-[var(--ds-space-050)] group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-start group-data-[collapsible=icon]:px-0">
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
