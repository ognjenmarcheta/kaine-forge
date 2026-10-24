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

/** The sidebar trigger's opening tag, where an aria-label would replace the visible text. */
const triggerTag = (markup: string): string =>
  /<button[^>]*data-sidebar="menu-button"[^>]*>/.exec(markup)?.[0] ?? "";

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

  it("renders a custom icon node beside the label", () => {
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
    expect(markup).toContain("lucide-building-2");
  });

  it("names the compact and full triggers by their visible label and value (#545)", () => {
    for (const display of ["compact", "full"] as const) {
      const markup = renderToStaticMarkup(
        <SidebarProvider>
          <ShellSelectControl
            display={display}
            icon="language"
            label="Language"
            options={[
              { label: "English", value: "en" },
              { label: "Deutsch", value: "de" }
            ]}
            value="en"
            onValueChange={vi.fn()}
          />
        </SidebarProvider>
      );

      // WCAG 2.5.3 Label in Name: no aria-label may replace the visible text.
      expect(triggerTag(markup), display).not.toContain("aria-label=");
      expect(markup, display).toContain("Language");
      expect(markup, display).toContain("English");
    }
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
