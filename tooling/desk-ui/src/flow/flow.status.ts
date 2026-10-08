import type { EdgeState, EdgeTone } from "@repo/desk/contracts";

import { toneClass, type Tone } from "../status/status.model";

export const EDGE_TONE_TONE: Readonly<Record<EdgeTone, Tone>> = {
  neutral: "neutral",
  warn: "warning",
  bad: "danger"
};

export const edgeClasses = (state: EdgeState, tone: EdgeTone, dashed: boolean): string =>
  [
    "desk-edge",
    `desk-edge--${state}`,
    toneClass(EDGE_TONE_TONE[tone]),
    dashed ? "desk-edge--loop" : ""
  ]
    .filter((name) => name !== "")
    .join(" ");
