// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import TodosScreen from "../../../app/(app)/todos";

const scope = vi.hoisted(() => ({ activeOrganizationId: "first" }));
vi.mock("../../hooks/use-organization", () => ({ useOrganization: () => scope }));
vi.mock("./todos.route", () => ({
  TodosRoute: () => {
    const [owner] = useState(scope.activeOrganizationId);
    return <p>{owner}</p>;
  }
}));

it("preserves native Todo content within a scope and remounts it on Organization switches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TodosScreen />));
    expect(container.textContent).toBe("first");
    await act(async () => root.render(<TodosScreen />));
    expect(container.textContent).toBe("first");
    scope.activeOrganizationId = "second";
    await act(async () => root.render(<TodosScreen />));
    expect(container.textContent).toBe("second");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
