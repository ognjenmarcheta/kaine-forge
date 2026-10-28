// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "./table";

let container: HTMLDivElement;
let root: Root;
let contentWidth = 0;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  // jsdom has no layout: every box is 400px wide and holds content `contentWidth` wide.
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => 400);
  vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(() => contentWidth);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Table", () => {
  it.each([
    [800, "0", "region", "Patients"],
    [400, null, null, null]
  ] as const)(
    "with content %ipx wide in a 400px scroller has tabindex %s, role %s, and name %s",
    async (width, tabIndex, role, name) => {
      contentWidth = width;
      await act(async () =>
        root.render(
          <Table scrollLabel="Patients">
            <TableBody>
              <TableRow>
                <TableCell>Ada Lovelace</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )
      );
      const scroller = container.querySelector('[data-slot="table-container"]');

      expect(scroller?.getAttribute("tabindex")).toBe(tabIndex);
      expect(scroller?.getAttribute("role")).toBe(role);
      expect(scroller?.getAttribute("aria-label")).toBe(name);
    }
  );
});
