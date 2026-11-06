import { describe, expect, it } from "vitest";

import { agentFrontmatterSchema, avatarOf } from "./agent-definition.contract";

const frontmatter = {
  id: "notes",
  name: "Release notes",
  description: "Writes the release notes of a change.",
  provider: "claude",
  output: "report",
  capabilities: { preset: "read-only" }
};

describe("agent avatar", () => {
  it("accepts a known glyph and tone", () => {
    const avatar = { glyph: "compass", tone: "chart-4" };
    expect(agentFrontmatterSchema.parse({ ...frontmatter, avatar }).avatar).toEqual(avatar);
  });

  it.each([
    { case: "an unknown glyph", avatar: { glyph: "rocket", tone: "brand" } },
    { case: "an unknown tone", avatar: { glyph: "bot", tone: "danger" } },
    { case: "an extra key", avatar: { glyph: "bot", tone: "brand", image: "me.png" } }
  ])("rejects $case", ({ avatar }) => {
    expect(agentFrontmatterSchema.safeParse({ ...frontmatter, avatar }).success).toBe(false);
  });

  it("keeps the agent's own avatar", () => {
    expect(avatarOf({ id: "notes", avatar: { glyph: "gauge", tone: "information" } })).toEqual({
      glyph: "gauge",
      tone: "information"
    });
  });

  // The default depends on the id alone, so an agent keeps its look across machines and releases.
  it.each([
    { id: "notes", expected: { glyph: "lock", tone: "brand" } },
    { id: "scout", expected: { glyph: "lightbulb", tone: "brand" } },
    { id: "release-notes", expected: { glyph: "palette", tone: "chart-1" } }
  ])("gives $id the same default every time", ({ id, expected }) => {
    expect(avatarOf({ id })).toEqual(expected);
  });
});
