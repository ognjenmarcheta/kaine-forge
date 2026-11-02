import { describe, expect, it } from "vitest";

import { mergeText } from "./sync.merge";

const BASE = "one\ntwo\nthree\nfour\nfive";

describe("mergeText", () => {
  it.each([
    [
      "keeps edits to different lines",
      "ONE\ntwo\nthree\nfour\nfive",
      "one\ntwo\nthree\nfour\nFIVE",
      "ONE\ntwo\nthree\nfour\nFIVE"
    ],
    [
      "keeps inserts at different places",
      "zero\none\ntwo\nthree\nfour\nfive",
      "one\ntwo\nthree\nfour\nfive\nsix",
      "zero\none\ntwo\nthree\nfour\nfive\nsix"
    ],
    [
      "keeps a deletion beside an edit elsewhere",
      "one\nthree\nfour\nfive",
      "one\ntwo\nthree\nfour\nFIVE",
      "one\nthree\nfour\nFIVE"
    ],
    [
      "takes the one side that changed",
      BASE,
      "one\ntwo\nTHREE\nfour\nfive",
      "one\ntwo\nTHREE\nfour\nfive"
    ],
    [
      "takes the same edit made on both sides once",
      "one\nTWO\nthree\nfour\nfive",
      "one\nTWO\nthree\nfour\nfive",
      "one\nTWO\nthree\nfour\nfive"
    ]
  ])("%s", (_name, ours, theirs, merged) => {
    expect(mergeText(BASE, ours, theirs)).toBe(merged);
  });

  it.each([
    [
      "the same line, changed differently",
      "one\nTWO\nthree\nfour\nfive",
      "one\n2\nthree\nfour\nfive"
    ],
    ["adjacent lines", "one\nTWO\nthree\nfour\nfive", "one\ntwo\nTHREE\nfour\nfive"],
    [
      "different text inserted at one place",
      "one\ntwo\nmine\nthree\nfour\nfive",
      "one\ntwo\ntheirs\nthree\nfour\nfive"
    ],
    [
      "a line one side deleted and the other changed",
      "one\nthree\nfour\nfive",
      "one\nTWO\nthree\nfour\nfive"
    ]
  ])("conflicts on %s", (_name, ours, theirs) => {
    expect(mergeText(BASE, ours, theirs)).toBeNull();
  });

  it("merges edits to an empty base as inserts at one place, so they conflict", () => {
    expect(mergeText("", "mine", "theirs")).toBeNull();
  });
});
