import { FLOW_HANDLES, buildFlowModel } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import { FIT_PADDING, framedNodes, pipelineWidth, shouldRefit } from "./flow.fit";
import {
  CANVAS_SCALE,
  HANDLE_OFFSET,
  HANDLE_POSITION,
  HANDLE_TYPE,
  arcPath,
  edgeLabelParts,
  nodeNote,
  toFlowElements
} from "./flow.mapping";
import { EDGE_TONE_TONE, edgeClasses } from "./flow.status";
import { scenarioBoard } from "../../tests/fixture.data";
import { toneClass } from "../status/status.model";

const seed = (issueNumber: number) => {
  const issue = scenarioBoard().find((entry) => entry.state.issueNumber === issueNumber);
  if (issue === undefined) throw new Error("missing seed");
  return issue;
};
const modelOf = (issueNumber: number) => buildFlowModel(seed(issueNumber).state, Date.now());

describe("toFlowElements", () => {
  const model = modelOf(102);
  const { nodes, edges } = toFlowElements(model, (node) => node.id, "build");

  it("keeps the model's fixed positions, scaled to the canvas, and forbids moving or connecting", () => {
    expect(nodes).toHaveLength(model.nodes.length);
    for (const [index, node] of nodes.entries()) {
      const source = model.nodes[index];
      expect(node.position).toEqual({
        x: (source?.x ?? 0) * CANVAS_SCALE.x,
        y: (source?.y ?? 0) * CANVAS_SCALE.y
      });
      expect(node).toMatchObject({ draggable: false, connectable: false, selectable: true });
      expect(node.type).toBe("desk-node");
    }
  });

  it("marks the open stage as selected and names every node for a screen reader", () => {
    expect(nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(["build"]);
    expect(nodes.every((node) => node.ariaLabel === node.id)).toBe(true);
  });

  it("maps every model edge with its handles and data", () => {
    expect(edges.map((edge) => edge.id)).toEqual(model.edges.map((edge) => edge.id));
    const loop = edges.find((edge) => edge.id === "check->build");
    expect(loop).toMatchObject({
      source: "check",
      target: "build",
      sourceHandle: "ts",
      targetHandle: "tt",
      type: "desk-edge"
    });
    expect(loop?.data?.edge.dashed).toBe(true);
  });

  it("only names handles that exist on a node", () => {
    for (const edge of edges) {
      expect(FLOW_HANDLES).toContain(edge.sourceHandle);
      expect(FLOW_HANDLES).toContain(edge.targetHandle);
    }
    for (const handle of FLOW_HANDLES) {
      expect(HANDLE_POSITION[handle]).toBeDefined();
      expect(HANDLE_TYPE[handle]).toBe(
        handle === "r" || handle.endsWith("s") ? "source" : "target"
      );
    }
    expect(HANDLE_OFFSET.ts).not.toBe(HANDLE_OFFSET.tt);
  });
});

describe("edgeLabelParts", () => {
  it("lists automatic loops and the engineer's feedback separately", () => {
    const edge = modelOf(102).edges.find((entry) => entry.id === "check->build");
    expect(edge && edgeLabelParts(edge)).toEqual([{ kind: "check", count: 1, feedback: false }]);
  });

  it("has no label for a loop that was not used", () => {
    const edge = modelOf(101).edges.find((entry) => entry.dashed);
    expect(edge && edgeLabelParts(edge)).toEqual([]);
  });
});

describe("arcPath", () => {
  it("bends up for a negative arc and down for a positive one, by the arc's size at the peak", () => {
    const up = arcPath({ x: 0, y: 0 }, { x: 200, y: 0 }, -50);
    const down = arcPath({ x: 0, y: 0 }, { x: 200, y: 0 }, 50);
    expect(up.label).toEqual({ x: 100, y: -50 });
    expect(down.label).toEqual({ x: 100, y: 50 });
    expect(up.path.startsWith("M 0 0 C")).toBe(true);
  });
});

describe("nodeNote", () => {
  it("shows the first sentence of a stop and keeps the full reason for the tooltip", () => {
    const build = modelOf(103).nodes.find((node) => node.id === "build");
    const reason = "Two consecutive checks failed the same way:\nFAIL apps/web/src/board.test.tsx";
    expect(build && nodeNote(build, reason)).toEqual({
      short: "Two consecutive checks failed the same way: FAIL apps/web/src/board.test.tsx",
      full: reason
    });
  });

  it("has no note for a stage without a stop or activity", () => {
    const ticket = modelOf(102).nodes.find((node) => node.id === "ticket");
    expect(ticket && nodeNote(ticket, null)).toBeNull();
  });
});

describe("framedNodes", () => {
  it("shows the whole pipeline when it fits at a readable size", () => {
    expect(framedNodes(modelOf(102), 3000)).toBeUndefined();
  });

  it("shows the whole pipeline in the main column of a 1440 px desktop", () => {
    // 1440 - page padding (48) - inspector (384) - gap (24) - card padding (48) - borders.
    expect(framedNodes(modelOf(102), 932)).toBeUndefined();
  });

  it("fits the whole pipeline there at full size, so node text renders at its token size", () => {
    const room = 932 - 2 * parseFloat(FIT_PADDING);
    expect(room / pipelineWidth(modelOf(102))).toBeGreaterThanOrEqual(1);
  });

  it("frames the stages around the current one when it does not", () => {
    const ids = framedNodes(modelOf(102), 700)?.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining(["pr-review", "review", "ship"]));
    expect(ids).not.toContain("ticket");
  });

  it("shows everything when the width is not known yet or nothing is current", () => {
    expect(framedNodes(modelOf(102), 0)).toBeUndefined();
  });
});

describe("shouldRefit", () => {
  it("fits on the first measured size, never before the container has one", () => {
    expect(shouldRefit(null, { width: 0, height: 0 })).toBe(false);
    expect(shouldRefit(null, { width: 900, height: 360 })).toBe(true);
  });

  it("does not fit again for a new model at the same size, so pan and zoom stay", () => {
    expect(shouldRefit({ width: 900, height: 360 }, { width: 900, height: 360 })).toBe(false);
  });

  it("fits again when the container is resized", () => {
    expect(shouldRefit({ width: 900, height: 360 }, { width: 700, height: 360 })).toBe(true);
    expect(shouldRefit({ width: 900, height: 360 }, { width: 900, height: 300 })).toBe(true);
  });
});

describe("status to token mapping", () => {
  it("builds edge classes for state, tone, and loop", () => {
    expect(edgeClasses("active", "neutral", false)).toBe(
      `desk-edge desk-edge--active ${toneClass(EDGE_TONE_TONE.neutral)}`
    );
    expect(edgeClasses("traversed", "warn", true)).toContain("desk-edge--loop");
    expect(edgeClasses("idle", "bad", false)).toContain("desk-tone--danger");
  });

  it("derives the status of the real fixtures", () => {
    const statusOf = (issueNumber: number, id: string) =>
      modelOf(issueNumber).nodes.find((node) => node.id === id)?.status;
    expect(statusOf(101, "plan-gate")).toBe("waiting");
    expect(statusOf(103, "build")).toBe("failed");
    expect(statusOf(103, "check")).toBe("looped");
    expect(statusOf(104, "build")).toBe("running");
    expect(statusOf(102, "ship")).toBe("idle");
  });
});
