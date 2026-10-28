// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellCommandMenu } from "./command-menu";
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation
} from "./workspace-navigation.provider";

const LABELS: Readonly<Record<string, string>> = {
  "navigation.auditLog": "Audit log",
  "navigation.todos": "Todos",
  "notes.discardLeave": "Discard and leave"
};
vi.mock("../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => LABELS[key] ?? key })
}));
vi.mock("../hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganizationId: "organization-1",
    organizations: [{ id: "organization-1", name: "Acme" }],
    organizationsVisible: true,
    setActiveOrganization: () => Promise.resolve()
  })
}));
vi.mock("../features/organizations/organizations.hook", () => ({
  useOrganizationSettingsAccess: () => ({ can: () => false })
}));

const PREFERENCES = {
  language: { label: "Language", onValueChange: () => {}, options: [], value: "en" },
  theme: { label: "Theme", onValueChange: () => {}, options: [], value: "system" }
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has neither; cmdk measures the list and scrolls the selected item.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Marks the open page as holding unsaved work, as the Notes and Todos pages do. */
function UnsavedWork() {
  const { setProtection } = useWorkspaceNavigation();
  useEffect(
    () => setProtection({ dirty: true, feature: "notes", pending: false }),
    [setProtection]
  );
  return null;
}

function CurrentPath() {
  return <output>{useLocation().pathname}</output>;
}

function Shell({ canReadAuditLog, unsaved }: { canReadAuditLog: boolean; unsaved: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter initialEntries={["/dashboard"]}>
      <WorkspaceNavigationProvider>
        {unsaved ? <UnsavedWork /> : null}
        <ShellCommandMenu
          navigationContext={{
            canReadApiKeys: false,
            canReadAuditLog,
            canReadWebhooks: false,
            organizationsVisible: true
          }}
          onOpenChange={setOpen}
          open={open}
          preferences={PREFERENCES}
        />
        <CurrentPath />
      </WorkspaceNavigationProvider>
    </MemoryRouter>
  );
}

async function renderShell({ canReadAuditLog = false, unsaved = false } = {}) {
  await act(async () => root.render(<Shell canReadAuditLog={canReadAuditLog} unsaved={unsaved} />));
}

async function pressCtrlK() {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true, key: "k" }));
  });
}

async function chooseTodos() {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
  if (!input) throw new Error("the command menu did not open");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Todos");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  });
}

function currentPath() {
  return container.querySelector("output")?.textContent;
}

function optionLabels() {
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (option) => option.textContent
  );
}

describe("ShellCommandMenu", () => {
  it("opens on Ctrl+K and goes to Todos on Enter", async () => {
    await renderShell();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await pressCtrlK();
    await chooseTodos();

    expect(currentPath()).toBe("/todos");
    expect(document.querySelector('[role="dialog"] input')).toBeNull();
  });

  it("asks before it leaves a page with unsaved work", async () => {
    await renderShell({ unsaved: true });

    await pressCtrlK();
    await chooseTodos();

    expect(currentPath()).toBe("/dashboard");
    const discard = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Discard and leave"
    );
    if (!discard) throw new Error("the leave confirmation did not open");
    await act(async () => discard.click());

    expect(currentPath()).toBe("/todos");
  });

  it.each([
    [false, false],
    [true, true]
  ])("with audit log access %s lists the audit log: %s", async (canReadAuditLog, listed) => {
    await renderShell({ canReadAuditLog });

    await pressCtrlK();

    expect(optionLabels()).toContain("Todos");
    expect(optionLabels().includes("Audit log")).toBe(listed);
  });
});
