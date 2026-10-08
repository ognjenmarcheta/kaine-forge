import { describe, expect, it } from "vitest";

import { redact, redactAndBound } from "./log.redact";

describe("redact", () => {
  it.each([
    ["an Anthropic key", "key is sk-ant-api03-AbCdEf_123-xyz now"],
    ["an OpenAI key", "OPENAI sk-proj-AbCdEf123456 end"],
    ["a GitHub token", "gh auth ghp_1234567890abcdefABCDEF1234567890abcd ok"],
    ["a GitHub OAuth token", "gho_1234567890abcdefABCDEF end"],
    ["a fine-grained GitHub token", "github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz end"],
    ["a bearer token", "Authorization: Bearer abc.DEF-123_xyz"],
    ["a lowercase bearer token", "curl -H 'bearer secretvalue123'"],
    ["a JWT", "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123 end"],
    ["an assignment", "ANTHROPIC_API_KEY=supersecretvalue run"],
    ["a quoted JSON field", '{"password": "hunter2hunter2"}'],
    ["a URL with credentials", "git clone https://user:hunter2hunter2@example.com/repo.git"],
    ["a URL with a query string", "open https://example.com/cb?code=hunter2hunter2"]
  ])("hides %s", (_name, text) => {
    const clean = redact(text);
    expect(clean).toContain("[redacted]");
    for (const secret of [
      "sk-ant-api03",
      "sk-proj",
      "ghp_1234",
      "gho_1234",
      "github_pat_11",
      "abc.DEF",
      "secretvalue",
      "eyJhbGci",
      "supersecretvalue",
      "hunter2"
    ]) {
      expect(clean).not.toContain(secret);
    }
  });

  it("leaves ordinary text alone and strips terminal escape codes", () => {
    expect(redact("Edit src/feature.ts and run pnpm test")).toBe(
      "Edit src/feature.ts and run pnpm test"
    );
    expect(redact("\u001b[31mred\u001b[0m")).toBe("red");
  });
});

describe("redactAndBound", () => {
  it("redacts before it cuts, so a secret at the cut line does not survive", () => {
    const text = `${"a".repeat(10)} sk-ant-api03-AbCdEfGhIjKl ${"b".repeat(50)}`;
    const bounded = redactAndBound(text, 20);
    expect(bounded).not.toContain("sk-");
    expect(bounded.endsWith("...[truncated]")).toBe(true);
  });

  it("returns short text unchanged", () => {
    expect(redactAndBound("ok", 20)).toBe("ok");
  });
});
