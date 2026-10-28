// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PublicAssetUpload } from "./public-asset-upload";

const assets = vi.hoisted(() => ({
  value: { avatarUrl: null, organizationLogoUrl: null, uploadsEnabled: true }
}));

vi.mock("../public-assets.hook", () => ({
  usePublicAssets: () => ({ assets: assets.value }),
  usePublicAssetUpload: () => ({ failed: false, progress: null, upload: vi.fn() })
}));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t: (key: string) => key })
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([
  { uploadsEnabled: true, chooseButtons: 1, disabledNote: false },
  { uploadsEnabled: false, chooseButtons: 0, disabledNote: true }
])(
  "offers Choose image only when uploads are enabled ($uploadsEnabled)",
  async ({ uploadsEnabled, chooseButtons, disabledNote }) => {
    assets.value = { ...assets.value, uploadsEnabled };

    await act(async () => root.render(<PublicAssetUpload kind="avatar" ownerName="Ana" />));

    const buttons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent === "storage.publicAssets.choose"
    );
    expect(buttons).toHaveLength(chooseButtons);
    expect(container.textContent?.includes("storage.publicAssets.disabled")).toBe(disabledNote);
  }
);
