import { describe, expect, it } from "vitest";

import { translationInstance } from "./translation.config";

describe("translation.config", () => {
  it("loads configured languages", () => {
    expect(translationInstance.hasResourceBundle("en", "common")).toBe(true);
    expect(translationInstance.hasResourceBundle("sr", "common")).toBe(true);
    expect(translationInstance.hasResourceBundle("de", "common")).toBe(true);
  });

  it("returns translated keys for known entries", async () => {
    await translationInstance.changeLanguage("en");
    expect(translationInstance.t("common.appName")).toBe("Kaine Forge");

    await translationInstance.changeLanguage("de");
    expect(translationInstance.t("navigation.todos")).toBe("Aufgaben");
  });
});
