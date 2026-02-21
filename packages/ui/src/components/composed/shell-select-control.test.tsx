import { Building2 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  SHELL_ACTION_ITEM_VALUE,
  ShellSelectControl,
  applyShellSelectControlChange,
  resolveShellSelectDisplayValue
} from "./shell-select-control";
import { SidebarProvider } from "../primitives/sidebar";

describe("shell-select-control", () => {
  it("triggers action item callback without propagating value", () => {
    const onActionSelect = vi.fn();
    const onValueChange = vi.fn();

    applyShellSelectControlChange({
      actionItem: {
        label: "Create organization",
        onSelect: onActionSelect
      },
      nextValue: SHELL_ACTION_ITEM_VALUE,
      onValueChange
    });

    expect(onActionSelect).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("normalizes empty values to undefined for select placeholder support", () => {
    expect(resolveShellSelectDisplayValue("org-1")).toBe("org-1");
    expect(resolveShellSelectDisplayValue("")).toBeUndefined();
    expect(resolveShellSelectDisplayValue(undefined)).toBeUndefined();
  });

  it("renders icon, label, and options structure", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <ShellSelectControl
          icon={<Building2 aria-hidden className="size-4" />}
          label="Organization"
          options={[
            { label: "Personal", value: "org-1" },
            { label: "Team", value: "org-2" }
          ]}
          value="org-1"
          onValueChange={vi.fn()}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Organization");
    expect(markup).toContain('data-slot="dropdown-menu-trigger"');
    expect(markup).toContain('data-sidebar="menu-button"');
    expect(markup).toContain("lucide-building-2");
  });

  it("supports icon-only display with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <ShellSelectControl
          display="icon"
          icon="language"
          label="Language"
          options={[
            { label: "EN", value: "en" },
            { label: "DE", value: "de" }
          ]}
          value="en"
          onValueChange={vi.fn()}
        />
      </SidebarProvider>
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('data-sidebar="menu-button"');
    expect(markup).toContain('aria-label="Language"');
  });
});
