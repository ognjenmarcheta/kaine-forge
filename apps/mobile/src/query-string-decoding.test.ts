import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type QueryString = { parse: (query: string) => Record<string, string> };

describe("installed deep link query decoding contract", () => {
  it("decodes percent-encoded values with the ESM-only decode-uri-component", () => {
    const require = createRequire(import.meta.url);
    const routerRequire = createRequire(require.resolve("expo-router"));
    // SAFETY: query-string@7.1.3 exports parse(query) returning string values for these inputs.
    const queryString = routerRequire("query-string") as QueryString;

    expect(queryString.parse("?name=J%C3%B6rg&broken=%zz%C3%A5")).toEqual({
      name: "Jörg",
      broken: "%zzå"
    });
  });
});
