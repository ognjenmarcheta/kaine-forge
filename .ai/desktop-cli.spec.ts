import { describe, expect, it } from "vitest";

import { desktopStatus, formatDesktopStatusLine } from "./hooks/desktop-cli.mjs";

const ready = {
  ok: true,
  command: "status",
  data: { version: "1.0.2", supported_surfaces: ["window", "sheet", "alert", "menu"] }
};

describe("desktopStatus", () => {
  it.each([
    [
      "an absent CLI",
      null,
      "- Desktop automation: agent-desktop CLI not installed (optional; install: npm install -g agent-desktop@1.0.2)"
    ],
    [
      "the pinned CLI with a live bus",
      ready,
      "- Desktop automation: agent-desktop 1.0.2 ready for desktop apps and browsers (kaine-computer-use skill)"
    ],
    [
      "another CLI version",
      { ...ready, data: { ...ready.data, version: "1.1.0" } },
      "- Desktop automation: agent-desktop 1.1.0 ready for desktop apps and browsers (kaine-computer-use skill); agent-desktop 1.1.0 installed, repo pins 1.0.2 (npm install -g agent-desktop@1.0.2)"
    ],
    [
      "an accessibility bus that did not answer",
      { ...ready, data: { ...ready.data, supported_surfaces: [] } },
      "- Desktop automation: agent-desktop installed, but no accessibility surface answered; run agent-desktop status in the desktop session"
    ],
    [
      "an error envelope",
      { ok: false, error: { code: "PLATFORM_NOT_SUPPORTED" } },
      "- Desktop automation: agent-desktop installed, but no accessibility surface answered; run agent-desktop status in the desktop session"
    ]
  ])("reports %s", (_case, envelope, line) => {
    expect(formatDesktopStatusLine(desktopStatus(envelope))).toBe(line);
  });
});
