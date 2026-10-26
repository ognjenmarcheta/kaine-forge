import { describe, expect, it } from "vitest";

import { extractRegion, ledgerDocument } from "./ledger-document.util";

const ledger = (data: string): string =>
  [
    "# Ledger",
    "<!-- test:data:start -->",
    data,
    "<!-- test:data:end -->",
    "<!-- test:generated:start -->",
    "_placeholder_",
    "<!-- test:generated:end -->",
    ""
  ].join("\n");

const document = (allowEmpty: boolean) =>
  ledgerDocument<unknown>({
    dataMarker: "test:data",
    generatedMarker: "test:generated",
    parseData: (value) => value,
    render: (data) => `rendered ${JSON.stringify(data)}`,
    allowEmpty
  });

describe("ledgerDocument.parse", () => {
  it.each([
    ["a json block", '```json\n{ "a": 1 }\n```', false, { a: 1 }],
    ["a blank region when empty is allowed", "", true, {}],
    ["an empty json block when empty is allowed", "```json\n```", true, {}]
  ])("reads %s", (_label, data, allowEmpty, expected) => {
    expect(document(allowEmpty).parse(ledger(data))).toEqual(expected);
  });

  it.each([
    ["a missing marker pair", "# no markers\n", true, /missing the test:data marker pair/],
    ["a blank region in a strict ledger", ledger(""), false, /test:data region has no ```json/],
    ["unfenced JSON", ledger('{ "a": 1 }'), true, /test:data region has no ```json/],
    ["invalid JSON", ledger("```json\n{ not json\n```"), true, /test:data JSON is invalid/]
  ])("rejects %s", (_label, raw, allowEmpty, message) => {
    expect(() => document(allowEmpty).parse(raw)).toThrow(message);
  });
});

describe("ledgerDocument.rewrite", () => {
  it("replaces only the generated region, and a second rewrite changes nothing", () => {
    const raw = ledger("```json\n{}\n```");
    const once = document(false).rewrite(raw, { b: 2 });

    expect(extractRegion(once, "test:generated")).toContain('rendered {"b":2}');
    expect(extractRegion(once, "test:generated")).not.toContain("_placeholder_");
    expect(extractRegion(once, "test:data")).toBe(extractRegion(raw, "test:data"));
    expect(document(false).rewrite(once, { b: 2 })).toBe(once);
  });
});
