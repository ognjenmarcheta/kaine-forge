// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from "./sidebar";
import { Sheet, SheetContent, SheetTitle } from "../primitives/sheet";

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** Renders with effects, as the browser does, and returns the container. */
function mount(ui: ReactNode): HTMLElement {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const next = createRoot(container);
  root = next;
  act(() => next.render(ui));
  return container;
}

/** The text of the elements an ARIA id-reference attribute points to. */
function referencedText(element: Element | null, attribute: string): string | undefined {
  return element
    ?.getAttribute(attribute)
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");
}

describe("sidebar", () => {
  it("supports controlled open state and renders collapsed data attributes", () => {
    const onOpenChange = vi.fn();
    const markup = renderToStaticMarkup(
      <SidebarProvider defaultOpen open={false} onOpenChange={onOpenChange}>
        <Sidebar>
          <SidebarContent />
        </Sidebar>
      </SidebarProvider>
    );

    expect(markup).toContain('data-slot="sidebar"');
    expect(markup).toContain('data-state="collapsed"');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("renders trigger and rail without legacy button classes", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <Sidebar>
          <SidebarTrigger />
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>
    );

    expect(markup).toContain('data-slot="sidebar-trigger"');
    expect(markup).toContain('data-slot="sidebar-rail"');
    expect(markup).not.toContain("ui-button");
  });
});

describe("sidebar trigger", () => {
  it("draws the icon it is given in place of the panel icon, and keeps its name", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <SidebarProvider>
        <SidebarTrigger label="Collapse navigation">
          <svg className="chevrons" />
        </SidebarTrigger>
      </SidebarProvider>
    );
    const trigger = document.querySelector('[data-slot="sidebar-trigger"]');

    expect(
      Array.from(trigger?.querySelectorAll("svg") ?? [], (svg) => svg.getAttribute("class"))
    ).toEqual(["chevrons"]);
    expect(trigger?.textContent).toBe("Collapse navigation");
  });
});

describe("sidebar landmark", () => {
  it("holds its parts in a navigation landmark named by label, and adds none without it", () => {
    const container = mount(
      <SidebarProvider>
        <Sidebar label="Main">
          <SidebarContent>
            <a href="/home">Home</a>
          </SidebarContent>
        </Sidebar>
        <Sidebar>
          <SidebarContent>
            <a href="/help">Help</a>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    const landmarks = container.querySelectorAll("nav");

    expect(landmarks).toHaveLength(1);
    expect(landmarks[0]?.getAttribute("aria-label")).toBe("Main");
    expect(landmarks[0]?.querySelector('a[href="/home"]')).not.toBeNull();
  });
});

describe("sidebar group", () => {
  it("is a group named by its label, and a group without a label stays unnamed", () => {
    const container = mount(
      <>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        </SidebarGroup>
        <SidebarGroup />
      </>
    );
    const [labelled, unlabelled] = Array.from(
      container.querySelectorAll('[data-slot="sidebar-group"]')
    );

    expect(labelled?.getAttribute("role")).toBe("group");
    expect(referencedText(labelled ?? null, "aria-labelledby")).toBe("Workspace");
    expect(unlabelled?.hasAttribute("role")).toBe(false);
    expect(unlabelled?.hasAttribute("aria-labelledby")).toBe(false);
  });
});

describe("sidebar menu badge", () => {
  it("describes the link beside it, so a count reaches keyboard users", () => {
    const container = mount(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/inbox">Inbox</a>
            </SidebarMenuButton>
            <SidebarMenuBadge>12</SidebarMenuBadge>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/sent">Sent</a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    );

    expect(referencedText(container.querySelector('a[href="/inbox"]'), "aria-describedby")).toBe(
      "12"
    );
    expect(container.querySelector('a[href="/sent"]')?.hasAttribute("aria-describedby")).toBe(
      false
    );
  });

  it("lets the caller's place and text color hold in every state of its link", () => {
    const container = mount(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive>
              <a href="/inbox">Inbox</a>
            </SidebarMenuButton>
            <SidebarMenuBadge className="end-ds-200 top-ds-100 translate-y-0 text-ds-text-inverse">
              3
            </SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    );
    // Every class that places the badge or colors its text, with or without a state variant. The
    // fallback for an item that holds a submenu does not apply to this one.
    const placing = (
      container.querySelector('[data-slot="sidebar-menu-badge"]')?.getAttribute("class") ?? ""
    )
      .split(" ")
      .filter(
        (name) =>
          !name.startsWith("group-has-data-[sidebar=menu-sub]") &&
          /(?:^|:)-?(?:end|left|right|top|translate-y|text-ds-text)(?:-|$)/.test(name)
      );

    expect(placing).toEqual(["end-ds-200", "top-ds-100", "translate-y-0", "text-ds-text-inverse"]);
  });
});

describe("sidebar menu tooltip", () => {
  it("lets the first Escape close the sheet around it while the tooltip is hidden", () => {
    // The tooltip's positioning watches its size.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const onOpenChange = vi.fn();
    mount(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Navigation</SheetTitle>
          <SidebarProvider>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Orders">Orders</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarProvider>
        </SheetContent>
      </Sheet>
    );
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => element.textContent === "Orders"
    );
    act(() => button?.focus());
    act(() => {
      button?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
