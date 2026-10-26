import { describe, expect, it } from "vitest";

import { deriveTemplateAdoptionConfig } from "./template-adoption.util";
import {
  nextTemplateConfig,
  parseTemplateConfig,
  renderTemplateConfig,
  TEMPLATE_UPSTREAM_URL
} from "./template-sync.util";

const adoption = deriveTemplateAdoptionConfig({
  productName: "Acme Ops",
  desktopIdentifier: "com.acme.ops.desktop"
});
const base = "a".repeat(40);

describe("template config", () => {
  it("keeps the recorded upstream and sync base when adoption runs again", () => {
    const first = nextTemplateConfig(adoption, null);
    expect(first.upstream).toEqual({ url: TEMPLATE_UPSTREAM_URL, ref: "main" });

    const synced = {
      ...first,
      upstream: { url: "https://example.test/fork.git", ref: "v2" },
      base
    };
    const renamed = deriveTemplateAdoptionConfig({
      productName: "Acme Platform",
      desktopIdentifier: adoption.desktopIdentifier
    });
    const again = parseTemplateConfig(
      JSON.parse(renderTemplateConfig(nextTemplateConfig(renamed, synced)))
    );

    expect(again).toEqual({ ...synced, adoption: renamed });
  });

  it("rejects a base that is not a full commit SHA", () => {
    const record = JSON.parse(renderTemplateConfig(nextTemplateConfig(adoption, null)));
    expect(() => parseTemplateConfig({ ...record, base: "main" })).toThrow();
  });
});
