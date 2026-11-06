import { describe, expect, it } from "vitest";

import { exportedNames } from "./jobs.component";

describe("exportedNames", () => {
  it("reads declarations and export lists by their exported name", () => {
    const source = [
      "export function AppLayout() {}",
      "export const PLOT_RING = 2;",
      "export interface CardProps {}",
      "export type Tone = string;",
      "function useForm() {}",
      "export { useForm as useUiForm, type Tone as UiTone };",
      "export {\n  Tooltip,\n  TooltipTrigger\n};",
      "const hidden = 1;"
    ].join("\n");

    expect(exportedNames(source).sort()).toEqual(
      [
        "AppLayout",
        "CardProps",
        "PLOT_RING",
        "Tone",
        "Tooltip",
        "TooltipTrigger",
        "UiTone",
        "useUiForm"
      ].sort()
    );
  });
});
