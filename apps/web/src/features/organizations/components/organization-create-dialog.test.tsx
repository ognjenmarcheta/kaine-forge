// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationCreateDialog } from "./organization-create-dialog";

vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const onSubmit = vi.fn<(name: string) => Promise<void>>();
const onClose = vi.fn();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

// The modal renders through a portal, so query the document, not the container.
const nameInput = (): HTMLInputElement => {
  const element = document.getElementById("name");
  if (!(element instanceof HTMLInputElement)) throw new Error("Missing name input");
  return element;
};

const dialogForm = (): HTMLFormElement => {
  const element = document.querySelector("form.ui-form");
  if (!(element instanceof HTMLFormElement)) throw new Error("Missing dialog form");
  return element;
};

const typeName = async (value: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      nameInput(),
      value
    );
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async (): Promise<void> => {
  await act(async () => {
    dialogForm().requestSubmit();
  });
  // The form library validates and calls onSubmit on a later microtask.
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onSubmit.mockReset();
  onSubmit.mockResolvedValue(undefined);
  onClose.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<OrganizationCreateDialog isOpen onClose={onClose} onSubmit={onSubmit} />)
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("OrganizationCreateDialog", () => {
  it("submits the trimmed organization name and closes on success", async () => {
    await typeName("  Acme  ");

    await submit();

    expect(onSubmit).toHaveBeenCalledWith("Acme");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the generic error and stays open when saving fails", async () => {
    onSubmit.mockRejectedValue(new Error("organization name taken"));
    await typeName("Acme");

    await submit();

    expect(document.body.textContent).toContain("error.generic");
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
